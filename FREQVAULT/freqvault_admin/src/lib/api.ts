const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export const ADMIN_EMAIL_KEY = "adminEmail";
const AUTH_EVENT = "admin-auth-changed";
const ADMIN_CSRF_COOKIE = "admin_csrf_token";

let adminAccessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string | null;
  code?: string;
} & Record<string, unknown>;

export const readApiJson = async <T = Record<string, unknown>>(response: Response): Promise<{
  success: boolean;
  data: T;
  error: string | null;
  code: string;
}> => {
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  const hasEnvelope = typeof payload === "object" && payload !== null && "success" in payload;

  if (hasEnvelope) {
    const success = Boolean(payload.success);
    const bodyData = (payload.data ?? {}) as T;
    return {
      success,
      data: bodyData,
      error: payload.error ?? null,
      code: typeof payload.code === "string" ? payload.code : success ? "OK" : "REQUEST_FAILED"
    };
  }

  return {
    success: response.ok,
    data: payload as unknown as T,
    error: typeof (payload as Record<string, unknown>).error === "string"
      ? ((payload as Record<string, unknown>).error as string)
      : null,
    code: response.ok ? "OK" : "REQUEST_FAILED"
  };
};

const getCookieValue = (name: string): string => {
  const encodedName = `${name}=`;
  const cookies = document.cookie.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(encodedName)) {
      return decodeURIComponent(cookie.slice(encodedName.length));
    }
  }
  return "";
};

const getAdminCsrfToken = () => getCookieValue(ADMIN_CSRF_COOKIE);

const withCsrf = (headers: Headers, method = "GET") => {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return;
  const csrf = getAdminCsrfToken();
  if (csrf) {
    headers.set("X-CSRF-Token", csrf);
  }
};

export const getAdminToken = (): string | null => adminAccessToken;
export const getAdminEmail = (): string => localStorage.getItem(ADMIN_EMAIL_KEY) || "";

export const setAdminSession = (accessToken: string, email: string) => {
  adminAccessToken = accessToken;
  if (email) {
    localStorage.setItem(ADMIN_EMAIL_KEY, email);
  } else {
    localStorage.removeItem(ADMIN_EMAIL_KEY);
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
};

export const clearAdminSession = () => {
  adminAccessToken = null;
  localStorage.removeItem("isAuthenticated");
  localStorage.removeItem(ADMIN_EMAIL_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
};

export const onAdminAuthChange = (listener: () => void) => {
  window.addEventListener(AUTH_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(AUTH_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
};

const shouldAttemptRefresh = (path: string) => {
  return !path.includes("/api/admin/login") && !path.includes("/api/admin/refresh-token");
};

const refreshAdminAccessToken = async (): Promise<string | null> => {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      withCsrf(headers, "POST");
      const response = await fetch(`${API_BASE}/api/admin/refresh-token`, {
        method: "POST",
        credentials: "include",
        headers,
        body: "{}"
      });

      const parsed = await readApiJson<{ accessToken?: string; admin?: { email?: string } } & Record<string, unknown>>(response);
      const accessToken = parsed.data.accessToken || (parsed.data as Record<string, unknown>)?.accessToken as string | undefined;
      if (!response.ok || !accessToken) {
        clearAdminSession();
        return null;
      }

      const email = parsed.data.admin?.email || "";
      setAdminSession(accessToken, email);
      return accessToken;
    } catch {
      clearAdminSession();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

export const bootstrapAdminSession = async (): Promise<boolean> => {
  if (adminAccessToken) return true;
  const refreshed = await refreshAdminAccessToken();
  return Boolean(refreshed);
};

export const apiFetch = async (path: string, init: RequestInit = {}) => {
  const execute = async (tokenOverride?: string | null) => {
    const token = tokenOverride ?? getAdminToken();
    const headers = new Headers(init.headers || {});
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    withCsrf(headers, init.method || "GET");

    return fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers
    });
  };

  let response = await execute();

  if (response.status === 401 && shouldAttemptRefresh(path)) {
    const newAccessToken = await refreshAdminAccessToken();
    if (newAccessToken) {
      response = await execute(newAccessToken);
    }
  }

  if (response.status === 401 && !path.includes("/api/admin/login")) {
    clearAdminSession();
  }

  return response;
};

export const logoutAdminSession = async () => {
  const token = getAdminToken();

  try {
    if (token) {
      const headers = new Headers({
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      });
      withCsrf(headers, "POST");
      await fetch(`${API_BASE}/api/admin/logout`, {
        method: "POST",
        credentials: "include",
        headers,
        body: "{}"
      });
    }
  } catch {
    // Ignore transport errors, clear local auth state in all cases.
  } finally {
    clearAdminSession();
  }
};

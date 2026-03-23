export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export const USER_EMAIL_KEY = "email";
const AUTH_EVENT = "user-auth-changed";
const USER_CSRF_COOKIE = "user_csrf_token";

let userAccessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string | null;
  code?: string;
} & Record<string, unknown>;

export type UserSecurityEventType =
  | "ai_lock"
  | "forced_reauth"
  | "decrypt_start"
  | "decrypt_end"
  | "ai_boot_error"
  | "devtools_tamper"
  | "multi_face_detected"
  | "face_not_present"
  | "screen_reflection_risk"
  | "camera_aimed_at_screen"
  | "rapid_scene_change"
  | "monitoring_tamper";

export interface UserSecurityEventPayload {
  type: UserSecurityEventType;
  reason?: string;
  fileId?: string;
  status?: "success" | "failed" | "expired";
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}

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

const getUserCsrfToken = () => getCookieValue(USER_CSRF_COOKIE);

const withCsrf = (headers: Headers, method = "GET") => {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return;
  const csrf = getUserCsrfToken();
  if (csrf) {
    headers.set("X-CSRF-Token", csrf);
  }
};

export const getUserToken = (): string | null => userAccessToken;
export const getUserEmail = (): string => localStorage.getItem(USER_EMAIL_KEY) || "";

export const setUserSession = (accessToken: string, email: string) => {
  userAccessToken = accessToken;
  if (email) {
    localStorage.setItem(USER_EMAIL_KEY, email);
  } else {
    localStorage.removeItem(USER_EMAIL_KEY);
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
};

export const clearUserSession = () => {
  userAccessToken = null;
  localStorage.removeItem("isFirstLogin");
  localStorage.removeItem(USER_EMAIL_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
};

export const onUserAuthChange = (listener: () => void) => {
  window.addEventListener(AUTH_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(AUTH_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
};

const shouldAttemptRefresh = (path: string) => {
  return !path.includes("/api/user/login") && !path.includes("/api/user/refresh-token");
};

const refreshUserAccessToken = async (): Promise<string | null> => {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      withCsrf(headers, "POST");
      const response = await fetch(`${API_BASE_URL}/api/user/refresh-token`, {
        method: "POST",
        credentials: "include",
        headers,
        body: "{}"
      });

      const parsed = await readApiJson<{ accessToken?: string; email?: string } & Record<string, unknown>>(response);
      const accessToken = parsed.data.accessToken || (parsed.data as Record<string, unknown>)?.accessToken as string | undefined;
      if (!response.ok || !accessToken) {
        clearUserSession();
        return null;
      }

      const email = parsed.data.email || "";
      setUserSession(accessToken, email);
      return accessToken;
    } catch {
      clearUserSession();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

export const bootstrapUserSession = async (): Promise<boolean> => {
  if (userAccessToken) return true;
  const refreshed = await refreshUserAccessToken();
  return Boolean(refreshed);
};

export const apiFetch = async (path: string, init: RequestInit = {}) => {
  const execute = async (tokenOverride?: string | null) => {
    const token = tokenOverride ?? getUserToken();
    const headers = new Headers(init.headers || {});

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    withCsrf(headers, init.method || "GET");

    return fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers
    });
  };

  let response = await execute();

  if (response.status === 401 && shouldAttemptRefresh(path)) {
    const newAccessToken = await refreshUserAccessToken();
    if (newAccessToken) {
      response = await execute(newAccessToken);
    }
  }

  if (response.status === 401 && !path.includes("/api/user/login")) {
    clearUserSession();
  }

  return response;
};

export const logUserSecurityEvent = async (payload: UserSecurityEventPayload): Promise<boolean> => {
  try {
    const response = await apiFetch("/api/user/security-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        occurredAt: payload.occurredAt || new Date().toISOString()
      })
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const logoutUser = async (): Promise<boolean> => {
  try {
    const response = await apiFetch("/api/user/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    if (!response.ok) {
      await apiFetch("/api/user/logout-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      }).catch(() => undefined);
    }
    return response.ok;
  } catch {
    return false;
  } finally {
    clearUserSession();
  }
};

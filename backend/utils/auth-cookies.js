const crypto = require("crypto");

const isProduction = process.env.NODE_ENV === "production";
const COOKIE_SAME_SITE = isProduction
  ? "strict"
  : (process.env.COOKIE_SAME_SITE || "strict");
const COOKIE_SECURE = isProduction ? true : process.env.COOKIE_SECURE === "true";
if (isProduction && String(COOKIE_SAME_SITE).toLowerCase() !== "strict") {
  throw new Error("COOKIE_SAME_SITE must be strict in production.");
}

const REFRESH_COOKIE_NAME_BY_SCOPE = {
  admin: "admin_refresh_token",
  user: "user_refresh_token"
};

const CSRF_COOKIE_NAME_BY_SCOPE = {
  admin: "admin_csrf_token",
  user: "user_csrf_token"
};

const parseCookies = (req) => {
  const header = req.headers.cookie;
  if (!header || typeof header !== "string") {
    return {};
  }

  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex <= 0) return acc;
      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
};

const getCookieOptions = (scope) => ({
  path: `/api/${scope}`,
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: COOKIE_SAME_SITE
});

const getCsrfCookieOptions = (scope) => ({
  path: "/",
  httpOnly: false,
  secure: COOKIE_SECURE,
  sameSite: COOKIE_SAME_SITE
});

const setAuthCookies = (res, scope, refreshToken, csrfToken) => {
  const refreshCookie = REFRESH_COOKIE_NAME_BY_SCOPE[scope];
  const csrfCookie = CSRF_COOKIE_NAME_BY_SCOPE[scope];
  if (!refreshCookie || !csrfCookie) {
    throw new Error("Unknown auth cookie scope");
  }
  res.cookie(refreshCookie, refreshToken, getCookieOptions(scope));
  // Write the active root-path CSRF cookie first, then clear legacy scoped cookie.
  // This avoids clients/tests accidentally reading the transient cleared value.
  res.cookie(csrfCookie, csrfToken, getCsrfCookieOptions(scope));
  res.clearCookie(csrfCookie, {
    path: `/api/${scope}`,
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE
  });
};

const clearAuthCookies = (res, scope) => {
  const refreshCookie = REFRESH_COOKIE_NAME_BY_SCOPE[scope];
  const csrfCookie = CSRF_COOKIE_NAME_BY_SCOPE[scope];
  if (!refreshCookie || !csrfCookie) {
    throw new Error("Unknown auth cookie scope");
  }
  res.clearCookie(refreshCookie, getCookieOptions(scope));
  res.clearCookie(csrfCookie, {
    path: `/api/${scope}`,
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE
  });
  res.clearCookie(csrfCookie, getCsrfCookieOptions(scope));
};

const getRefreshTokenFromCookies = (req, scope) => {
  const refreshCookie = REFRESH_COOKIE_NAME_BY_SCOPE[scope];
  if (!refreshCookie) return "";
  const cookies = parseCookies(req);
  return String(cookies[refreshCookie] || "");
};

const getCsrfTokenFromCookies = (req, scope) => {
  const csrfCookie = CSRF_COOKIE_NAME_BY_SCOPE[scope];
  if (!csrfCookie) return "";
  const cookies = parseCookies(req);
  return String(cookies[csrfCookie] || "");
};

const getCsrfTokenFromHeader = (req) => {
  const value = req.headers["x-csrf-token"];
  if (Array.isArray(value)) return String(value[0] || "");
  return typeof value === "string" ? value : "";
};

const hashCsrfToken = (csrfToken) =>
  crypto.createHash("sha256").update(String(csrfToken || "")).digest("hex");

const validateCsrf = (req, scope, expectedHash) => {
  const headerToken = getCsrfTokenFromHeader(req);
  const cookieToken = getCsrfTokenFromCookies(req, scope);
  if (!headerToken || !cookieToken) {
    return { ok: false, reason: "missing csrf token" };
  }
  if (headerToken !== cookieToken) {
    return { ok: false, reason: "csrf token mismatch" };
  }
  if (expectedHash && hashCsrfToken(headerToken) !== expectedHash) {
    return { ok: false, reason: "csrf token does not match session" };
  }
  return { ok: true };
};

const createCsrfToken = () => crypto.randomBytes(32).toString("hex");

module.exports = {
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromCookies,
  hashCsrfToken,
  validateCsrf,
  createCsrfToken
};

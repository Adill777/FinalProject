const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const {User, AuditLog, Admin, Notification, RefreshToken, RevokedAccessToken} = require('../models/db.js')
const userRouter = express.Router();
const { MlKem768 } = require("mlkem");
const {Request,EncryptedFile}=require("../models/db.js");
const { getGridFSBucket } = require("../models/db.js");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const { notify, isEmailConfigured, isEmailEnabled } = require("../utils/notifications");
const { logAudit } = require("../utils/audit");
const { recordSecurityEvent } = require("../utils/security-alerts");
const { recordThreatEvent } = require("../utils/threat-protection");
const { log } = require("../utils/logger");
const { validatePasswordPolicy } = require("../utils/password-policy");
const { hashPassword, verifyPassword, needsPasswordMigration } = require("../utils/password-hash");
const { validateBody, validateParams, validateQuery, userSchemas } = require("../utils/validation");
const {
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromCookies,
  hashCsrfToken,
  validateCsrf,
  createCsrfToken
} = require("../utils/auth-cookies");
const USER_ACCESS_TOKEN_TTL = process.env.USER_ACCESS_TOKEN_TTL || "15m";
const USER_REFRESH_TOKEN_TTL_DAYS = Number(process.env.USER_REFRESH_TOKEN_TTL_DAYS || 7);
const USER_LOGIN_MAX_ATTEMPTS = Number(process.env.USER_LOGIN_MAX_ATTEMPTS || 5);
const USER_LOGIN_LOCK_MS = Number(process.env.USER_LOGIN_LOCK_MS || 15 * 60 * 1000);
const USER_LOGIN_RATE_LIMIT_MAX = Number(process.env.USER_LOGIN_RATE_LIMIT_MAX || 15);
const USER_REFRESH_RATE_LIMIT_MAX = Number(process.env.USER_REFRESH_RATE_LIMIT_MAX || 40);
const USER_DECRYPT_RATE_LIMIT_MAX = Number(process.env.USER_DECRYPT_RATE_LIMIT_MAX || 20);
const USER_DECRYPT_VIEW_WINDOW_MS = Number(process.env.USER_DECRYPT_VIEW_WINDOW_MS || 2 * 60 * 1000);
const USER_DECRYPT_STREAM_TIMEOUT_MS = Number(process.env.USER_DECRYPT_STREAM_TIMEOUT_MS || 10 * 60 * 1000);
const USER_REQUEST_ACCESS_RATE_LIMIT_MAX = Number(process.env.USER_REQUEST_ACCESS_RATE_LIMIT_MAX || 30);
const USER_FORGOT_PASSWORD_RATE_LIMIT_MAX = Number(process.env.USER_FORGOT_PASSWORD_RATE_LIMIT_MAX || 8);
const USER_RESET_PASSWORD_RATE_LIMIT_MAX = Number(process.env.USER_RESET_PASSWORD_RATE_LIMIT_MAX || 20);
const USER_PASSWORD_RESET_MIN_INTERVAL_MS = Number(process.env.USER_PASSWORD_RESET_MIN_INTERVAL_MS || 60 * 1000);
const USER_ACCOUNT_GUARD_WINDOW_MS = Number(process.env.USER_ACCOUNT_GUARD_WINDOW_MS || 15 * 60 * 1000);
const USER_ACCOUNT_GUARD_LOGIN_MAX = Number(process.env.USER_ACCOUNT_GUARD_LOGIN_MAX || USER_LOGIN_MAX_ATTEMPTS);
const USER_ACCOUNT_GUARD_REFRESH_MAX = Number(process.env.USER_ACCOUNT_GUARD_REFRESH_MAX || 20);
const USER_ACCOUNT_GUARD_FORGOT_MAX = Number(process.env.USER_ACCOUNT_GUARD_FORGOT_MAX || 5);
const USER_ACCOUNT_GUARD_RESET_MAX = Number(process.env.USER_ACCOUNT_GUARD_RESET_MAX || 8);
const USER_ACCOUNT_GUARD_DECRYPT_MAX = Number(process.env.USER_ACCOUNT_GUARD_DECRYPT_MAX || 10);
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || "").trim();
const GOOGLE_CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
const GOOGLE_REDIRECT_URI = String(
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/user/auth/google/callback"
).trim();
const GOOGLE_OAUTH_FLAG = String(process.env.GOOGLE_OAUTH_ENABLED || "").trim().toLowerCase();
const GOOGLE_OAUTH_DISABLED = GOOGLE_OAUTH_FLAG === "false";
const GOOGLE_OAUTH_ENABLED = GOOGLE_OAUTH_DISABLED
  ? false
  : GOOGLE_OAUTH_FLAG === "true" || Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI);
const USER_OAUTH_SUCCESS_REDIRECT = String(
  process.env.USER_OAUTH_SUCCESS_REDIRECT || "http://localhost:8081/files"
).trim();
const USER_OAUTH_FAILURE_REDIRECT = String(
  process.env.USER_OAUTH_FAILURE_REDIRECT || "http://localhost:8081/signup"
).trim();
const USER_RESET_PASSWORD_REDIRECT_BASE = String(
  process.env.USER_RESET_PASSWORD_REDIRECT_BASE || "http://localhost:8081/reset-password"
).trim();
const USER_PASSWORD_RESET_TTL_MINUTES = Number(process.env.USER_PASSWORD_RESET_TTL_MINUTES || 30);
const USER_PASSWORD_RESET_DEV_FALLBACK = String(process.env.USER_PASSWORD_RESET_DEV_FALLBACK || "false").toLowerCase() === "true";
const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV !== "production" ? crypto.randomBytes(32).toString("hex") : undefined);

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production");
}
if (!Number.isFinite(USER_REFRESH_TOKEN_TTL_DAYS) || USER_REFRESH_TOKEN_TTL_DAYS <= 0) {
  throw new Error("USER_REFRESH_TOKEN_TTL_DAYS must be a positive number");
}
if (!Number.isFinite(USER_LOGIN_RATE_LIMIT_MAX) || USER_LOGIN_RATE_LIMIT_MAX <= 0) {
  throw new Error("USER_LOGIN_RATE_LIMIT_MAX must be a positive number");
}
if (!Number.isFinite(USER_REFRESH_RATE_LIMIT_MAX) || USER_REFRESH_RATE_LIMIT_MAX <= 0) {
  throw new Error("USER_REFRESH_RATE_LIMIT_MAX must be a positive number");
}
if (!Number.isFinite(USER_DECRYPT_RATE_LIMIT_MAX) || USER_DECRYPT_RATE_LIMIT_MAX <= 0) {
  throw new Error("USER_DECRYPT_RATE_LIMIT_MAX must be a positive number");
}
if (!Number.isFinite(USER_DECRYPT_VIEW_WINDOW_MS) || USER_DECRYPT_VIEW_WINDOW_MS <= 0) {
  throw new Error("USER_DECRYPT_VIEW_WINDOW_MS must be a positive number");
}
if (!Number.isFinite(USER_DECRYPT_STREAM_TIMEOUT_MS) || USER_DECRYPT_STREAM_TIMEOUT_MS <= 0) {
  throw new Error("USER_DECRYPT_STREAM_TIMEOUT_MS must be a positive number");
}
if (!Number.isFinite(USER_REQUEST_ACCESS_RATE_LIMIT_MAX) || USER_REQUEST_ACCESS_RATE_LIMIT_MAX <= 0) {
  throw new Error("USER_REQUEST_ACCESS_RATE_LIMIT_MAX must be a positive number");
}
if (!Number.isFinite(USER_FORGOT_PASSWORD_RATE_LIMIT_MAX) || USER_FORGOT_PASSWORD_RATE_LIMIT_MAX <= 0) {
  throw new Error("USER_FORGOT_PASSWORD_RATE_LIMIT_MAX must be a positive number");
}
if (!Number.isFinite(USER_RESET_PASSWORD_RATE_LIMIT_MAX) || USER_RESET_PASSWORD_RATE_LIMIT_MAX <= 0) {
  throw new Error("USER_RESET_PASSWORD_RATE_LIMIT_MAX must be a positive number");
}
if (!Number.isFinite(USER_PASSWORD_RESET_TTL_MINUTES) || USER_PASSWORD_RESET_TTL_MINUTES <= 0) {
  throw new Error("USER_PASSWORD_RESET_TTL_MINUTES must be a positive number");
}
if (!Number.isFinite(USER_PASSWORD_RESET_MIN_INTERVAL_MS) || USER_PASSWORD_RESET_MIN_INTERVAL_MS <= 0) {
  throw new Error("USER_PASSWORD_RESET_MIN_INTERVAL_MS must be a positive number");
}
if (GOOGLE_OAUTH_ENABLED) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth is enabled but GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI are missing");
  }
}

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const accountGuardStore = new Map();
const accountGuardKey = (action, identifier) => `${String(action || "")}:${String(identifier || "").toLowerCase()}`;
const isAccountActionBlocked = (action, identifier, maxAttempts) => {
  if (!identifier) return false;
  const key = accountGuardKey(action, identifier);
  const now = Date.now();
  const current = accountGuardStore.get(key);
  if (!current) return false;
  if (now - current.windowStart > USER_ACCOUNT_GUARD_WINDOW_MS) {
    accountGuardStore.delete(key);
    return false;
  }
  return current.count >= maxAttempts;
};
const recordAccountActionFailure = (action, identifier) => {
  if (!identifier) return;
  const key = accountGuardKey(action, identifier);
  const now = Date.now();
  const current = accountGuardStore.get(key);
  if (!current || now - current.windowStart > USER_ACCOUNT_GUARD_WINDOW_MS) {
    accountGuardStore.set(key, { count: 1, windowStart: now });
    return;
  }
  current.count += 1;
  accountGuardStore.set(key, current);
};
const clearAccountActionFailures = (action, identifier) => {
  if (!identifier) return;
  accountGuardStore.delete(accountGuardKey(action, identifier));
};

const isPlaceholderValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes("replace_with") ||
    normalized.includes("your_google_client") ||
    normalized.includes("changeme") ||
    normalized.includes("example")
  );
};

const randomStrongPassword = () => `${crypto.randomBytes(24).toString("base64url")}#A1a`;

const ensureGoogleOAuthConfigured = (res) => {
  if (!GOOGLE_OAUTH_ENABLED) {
    fail(
      res,
      503,
      "Google OAuth is disabled. Set GOOGLE_OAUTH_ENABLED=true or provide GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI.",
      "OAUTH_DISABLED"
    );
    return false;
  }
  const invalidConfigKeys = [];
  if (isPlaceholderValue(GOOGLE_CLIENT_ID)) invalidConfigKeys.push("GOOGLE_CLIENT_ID");
  if (isPlaceholderValue(GOOGLE_CLIENT_SECRET)) invalidConfigKeys.push("GOOGLE_CLIENT_SECRET");
  if (isPlaceholderValue(GOOGLE_REDIRECT_URI)) invalidConfigKeys.push("GOOGLE_REDIRECT_URI");
  if (invalidConfigKeys.length > 0) {
    fail(
      res,
      500,
      `Google OAuth is not configured correctly. Invalid keys: ${invalidConfigKeys.join(", ")}`,
      "OAUTH_MISCONFIGURED"
    );
    return false;
  }
  if (typeof fetch !== "function") {
    fail(res, 500, "Runtime does not support OAuth HTTP requests", "OAUTH_RUNTIME_UNSUPPORTED");
    return false;
  }
  return true;
};

const buildRedirectWithError = (baseUrl, errorCode) => {
  const url = new URL(baseUrl);
  url.searchParams.set("oauth_error", errorCode);
  return url.toString();
};

const createGoogleStateToken = () =>
  jwt.sign(
    { type: "google_oauth_state", nonce: crypto.randomUUID() },
    JWT_SECRET,
    { expiresIn: "10m" }
  );

const verifyGoogleStateToken = (state) => {
  const payload = jwt.verify(String(state || ""), JWT_SECRET);
  if (!payload || payload.type !== "google_oauth_state") {
    throw new Error("Invalid OAuth state");
  }
  return payload;
};

const exchangeGoogleCode = async (code) => {
  const body = new URLSearchParams({
    code: String(code),
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code"
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const tokenPayload = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenPayload.access_token) {
    throw new Error("Failed to exchange Google OAuth code");
  }
  return tokenPayload;
};

const fetchGoogleProfile = async (accessToken) => {
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const profile = await profileRes.json().catch(() => ({}));
  if (!profileRes.ok || !profile.email) {
    throw new Error("Failed to fetch Google profile");
  }
  return profile;
};

const ok = (res, data = {}, message = "OK", statusCode = 200) => {
  const payload = data && typeof data === "object" && !Array.isArray(data) ? data : { value: data };
  return res.status(statusCode).json({ success: true, data: payload, error: null, code: "OK", message, ...payload });
};

const fail = (res, statusCode, error, code = "REQUEST_FAILED", data = null) => {
  if (typeof res.fail === "function") return res.fail(statusCode, error, code, data);
  return res.status(statusCode).json({ success: false, data, error, code });
};

const createUserAccessToken = (user) => {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { id: user._id.toString(), email: user.email, role: "user", type: "access", jti },
    JWT_SECRET,
    { expiresIn: USER_ACCESS_TOKEN_TTL }
  );
  return { token, jti };
};

const createUserRefreshTokenSession = async ({ user, familyId, ipAddress, userAgent }) => {
  const jti = crypto.randomUUID();
  const csrfToken = createCsrfToken();
  const token = jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      role: "user",
      type: "refresh",
      jti,
      familyId
    },
    JWT_SECRET,
    { expiresIn: `${USER_REFRESH_TOKEN_TTL_DAYS}d` }
  );

  const payload = jwt.decode(token);
  const expiresAt = payload?.exp
    ? new Date(payload.exp * 1000)
    : new Date(Date.now() + USER_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const tokenHash = hashToken(token);

  await RefreshToken.create({
    subjectType: "user",
    subjectId: user._id.toString(),
    subjectEmail: user.email,
    tokenHash,
    csrfTokenHash: hashCsrfToken(csrfToken),
    familyId,
    expiresAt,
    ipAddress,
    userAgent
  });

  return { token, tokenHash, csrfToken };
};

const revokeUserRefreshFamily = async (familyId) => {
  if (!familyId) return;
  await RefreshToken.updateMany(
    { familyId, subjectType: "user", revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
};

const requireUserAuth = async (req, res, next) => {
  const ipAddress = getClientIp(req);
  const userAgent = String(req.headers["user-agent"] || "");
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    await alertSecurity(req, {
      eventType: "auth_missing_bearer",
      code: "AUTH_MISSING",
      reason: "missing bearer token"
    });
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== "access" || payload.role !== "user") {
      await alertSecurity(req, {
        eventType: "auth_invalid_token_type",
        code: "AUTH_INVALID_TYPE",
        actorType: "user",
        actorId: String(payload.id || ""),
        actorEmail: String(payload.email || ""),
        reason: "invalid access token type"
      });
      return res.status(401).json({ error: "Invalid token type" });
    }

    const revoked = await RevokedAccessToken.findOne({
      jti: payload.jti,
      subjectType: "user",
      subjectId: payload.id
    });
    if (revoked) {
      await alertSecurity(req, {
        eventType: "auth_revoked_access_token",
        code: "AUTH_REVOKED",
        actorType: "user",
        actorId: String(payload.id || ""),
        actorEmail: String(payload.email || ""),
        targetType: "session",
        targetId: String(payload.jti || ""),
        targetEmail: String(payload.email || ""),
        reason: "revoked access token reuse"
      });
      return res.status(401).json({ error: "Token revoked" });
    }

    req.user = {
      id: payload.id,
      email: payload.email,
      jti: payload.jti
    };
    return next();
  } catch (_err) {
    await alertSecurity(req, {
      eventType: "auth_invalid_or_expired",
      code: "AUTH_INVALID",
      reason: "invalid or expired access token"
    });
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  let ip = "";

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    ip = forwarded[0];
  } else if (typeof forwarded === "string" && forwarded.length > 0) {
    ip = forwarded.split(",")[0].trim();
  }

  if (!ip) {
    ip = req.ip || req.socket?.remoteAddress || "";
  }

  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") ip = "127.0.0.1";

  return ip || "unknown";
};

const recordAudit = async (entry) => {
  try {
    await logAudit({ AuditLogModel: AuditLog, ...entry });
  } catch (_err) {
    // Audit failures should not block primary actions.
  }
};

const getCorrelationId = (req) => {
  if (typeof req.correlationId === "string" && req.correlationId.trim()) {
    return req.correlationId.trim();
  }
  const headerId = req.headers["x-correlation-id"];
  if (typeof headerId === "string" && headerId.trim()) return headerId.trim();
  return crypto.randomUUID();
};

const SECURITY_EVENT_CODE_MAP = {
  ai_lock: "MONITORING_TAMPER",
  forced_reauth: "SESSION_ANOMALY",
  ai_boot_error: "MONITORING_TAMPER",
  devtools_tamper: "DEVTOOLS_TAMPER",
  multi_face_detected: "MULTI_FACE",
  face_not_present: "FACE_NOT_PRESENT",
  screen_reflection_risk: "SCREEN_REFLECTION",
  camera_aimed_at_screen: "CAMERA_AIMED_SCREEN",
  rapid_scene_change: "RAPID_SCENE_CHANGE",
  monitoring_tamper: "MONITORING_TAMPER"
};

const alertSecurity = async (req, details) => {
  const correlationId = getCorrelationId(req);
  const ipAddress = getClientIp(req);
  const userAgent = String(req.headers["user-agent"] || "");
  const event = {
    level: "warn",
    type: "security_alert",
    correlationId,
    ipAddress,
    userAgent,
    route: req.originalUrl || req.url || "",
    method: req.method || "",
    ...details
  };

  log("warn", "security_alert", event);

  await recordAudit({
    actorType: details.actorType || "system",
    actorId: details.actorId || "",
    actorEmail: details.actorEmail || "",
    action: "security_alert",
    targetType: details.targetType || "session",
    targetId: details.targetId || "",
    targetEmail: details.targetEmail || "",
    reason: details.reason || "security anomaly",
    ipAddress,
    metadata: {
      correlationId,
      userAgent,
      eventType: details.eventType || "unknown",
      code: details.code || "unknown"
    }
  });

  const elevated = recordSecurityEvent({
    code: details.code,
    ipAddress,
    userAgent
  });
  if (elevated) {
    const elevatedEvent = {
      level: "error",
      type: "security_alert_elevated",
      correlationId,
      ipAddress,
      userAgent,
      route: req.originalUrl || req.url || "",
      method: req.method || "",
      eventType: elevated.alertType,
      code: elevated.code,
      count: elevated.count,
      windowMs: elevated.windowMs
    };
    log("error", "security_alert_elevated", elevatedEvent);

    await recordAudit({
      actorType: details.actorType || "system",
      actorId: details.actorId || "",
      actorEmail: details.actorEmail || "",
      action: "security_alert_elevated",
      targetType: details.targetType || "session",
      targetId: details.targetId || "",
      targetEmail: details.targetEmail || "",
      reason: elevated.alertType,
      ipAddress,
      metadata: {
        correlationId,
        userAgent,
        code: elevated.code,
        count: elevated.count,
        windowMs: elevated.windowMs
      }
    });
  }

  recordThreatEvent({
    code: details.code,
    ipAddress,
    userAgent,
    route: req.originalUrl || req.url || "",
    method: req.method || "",
    actorType: details.actorType || "",
    actorId: details.actorId || "",
    actorEmail: details.actorEmail || ""
  });
};

const markUserAuthFailure = async (user) => {
  if (!user) return;
  user.loginAttempts = Number(user.loginAttempts || 0) + 1;
  if (user.loginAttempts >= USER_LOGIN_MAX_ATTEMPTS) {
    user.lockedUntil = new Date(Date.now() + USER_LOGIN_LOCK_MS);
  }
  await user.save();
};

const userLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: USER_LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Please try again later." }
});

const userRefreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: USER_REFRESH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many refresh attempts. Please try again later." }
});

const userDecryptRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: USER_DECRYPT_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many decrypt attempts. Please try again later." }
});

const userRequestAccessRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: USER_REQUEST_ACCESS_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many access requests. Please try again later." }
});

const userForgotPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: USER_FORGOT_PASSWORD_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset requests. Please try again later." }
});

const userResetPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: USER_RESET_PASSWORD_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reset attempts. Please try again later." }
});





//signup
userRouter.post('/', validateBody(userSchemas.signup), async(req,res)=>
{
    try{
        const{firstname,lastname,email,password}=req.body;
        if(!email || !password || !firstname){
            return fail(res, 400, "Missing required fields", "VALIDATION_ERROR");
        }

        const passwordPolicy = validatePasswordPolicy(password);
        if (!passwordPolicy.valid) {
          return fail(res, 400, passwordPolicy.errors[0], "PASSWORD_POLICY_VIOLATION");
        }

        const existinguser = await User.findOne({email:email});
        if(existinguser){
            return fail(res, 409, "User already exists", "USER_EXISTS");
        }

        const savedUser = await User.create({
            firstname,
            lastname,
            email,
            password: hashPassword(password)
        });

        // audit log
        await recordAudit({
          actorType: "user",
          actorId: savedUser._id.toString(),
          actorEmail: email,
          action: "user_signup",
          targetType: "user",
          targetId: savedUser._id.toString(),
          targetEmail: email,
          reason: "new account created",
          ipAddress: getClientIp(req),
          metadata: {}
        });

        return ok(
          res,
          {
            user: {
              id: savedUser.id,
              email: savedUser.email
            }
          },
          "user created successfully"
        );
    
     } catch(error){
        return fail(res, 500, "Failed to create user", "USER_CREATE_FAILED");
        
    }
})

//login

userRouter.post("/forgot-password", userForgotPasswordRateLimiter, validateBody(userSchemas.forgotPassword), async (req, res) => {
  try {
    const { email } = req.body;
    if (isAccountActionBlocked("forgot_password", email, USER_ACCOUNT_GUARD_FORGOT_MAX)) {
      await alertSecurity(req, {
        eventType: "forgot_password_account_throttled",
        code: "RESET_ABUSE",
        actorType: "user",
        actorEmail: String(email || ""),
        reason: "forgot-password per-account throttle triggered"
      });
      return fail(res, 429, "Too many password reset requests. Please try again later.", "RESET_RATE_LIMITED");
    }
    recordAccountActionFailure("forgot_password", email);

    const user = await User.findOne({ email });
    const isDev = process.env.NODE_ENV !== "production";
    let devResetUrl = null;
    let emailDelivered = false;

    if (user) {
      const now = Date.now();
      if (
        user.passwordResetRequestedAt &&
        now - new Date(user.passwordResetRequestedAt).getTime() < USER_PASSWORD_RESET_MIN_INTERVAL_MS
      ) {
        recordAccountActionFailure("forgot_password", email);
        await alertSecurity(req, {
          eventType: "forgot_password_min_interval_violation",
          code: "RESET_ABUSE",
          actorType: "user",
          actorId: user._id.toString(),
          actorEmail: user.email,
          reason: "forgot-password requested too frequently for account"
        });
        return fail(res, 429, "Too many password reset requests. Please try again later.", "RESET_RATE_LIMITED");
      }

      const resetToken = crypto.randomBytes(32).toString("hex");
      user.passwordResetTokenHash = hashToken(resetToken);
      user.passwordResetExpiresAt = new Date(Date.now() + USER_PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
      user.passwordResetRequestedAt = new Date();
      await user.save();

      const resetUrl = new URL(USER_RESET_PASSWORD_REDIRECT_BASE);
      resetUrl.searchParams.set("token", resetToken);
      devResetUrl = resetUrl.toString();

      const notifyResult = await notify({
        NotificationModel: Notification,
        recipientType: "user",
        recipientEmail: user.email,
        eventType: "password_reset_requested",
        title: "Password Reset Requested",
        message: "A password reset link was generated for your account.",
        metadata: {
          expiresInMinutes: USER_PASSWORD_RESET_TTL_MINUTES
        },
        emailSubject: "Aeronox password reset request",
        emailText: `Use this link to reset your password: ${resetUrl.toString()}\n\nThis link expires in ${USER_PASSWORD_RESET_TTL_MINUTES} minutes.`
      });
      emailDelivered = Boolean(notifyResult?.emailDelivered);
      if (!emailDelivered) {
        recordAccountActionFailure("forgot_password", email);
        log("warn", "password_reset_email_not_delivered", {
          emailConfigured: isEmailConfigured(),
          emailEnabled: isEmailEnabled(),
          emailError: String(notifyResult?.emailError || "")
        });
      } else {
        clearAccountActionFailures("forgot_password", email);
      }
    }

    if (isDev && USER_PASSWORD_RESET_DEV_FALLBACK && user && !emailDelivered && devResetUrl) {
      return ok(
        res,
        { devResetUrl, delivery: "email_not_delivered" },
        "If the email is registered, a password reset link has been sent."
      );
    }

    return ok(res, {}, "If the email is registered, a password reset link has been sent.");
  } catch (_err) {
    return fail(res, 500, "Failed to process password reset request", "FORGOT_PASSWORD_FAILED");
  }
});

userRouter.post("/reset-password", userResetPasswordRateLimiter, validateBody(userSchemas.resetPassword), async (req, res) => {
  try {
    const { token, password } = req.body;
    const tokenFingerprint = hashToken(token).slice(0, 16);
    if (isAccountActionBlocked("reset_password", tokenFingerprint, USER_ACCOUNT_GUARD_RESET_MAX)) {
      await alertSecurity(req, {
        eventType: "reset_password_token_throttled",
        code: "RESET_ABUSE",
        reason: "reset-password token throttle triggered"
      });
      return fail(res, 429, "Too many reset attempts. Please try again later.", "RESET_RATE_LIMITED");
    }

    const passwordPolicy = validatePasswordPolicy(password);
    if (!passwordPolicy.valid) {
      recordAccountActionFailure("reset_password", tokenFingerprint);
      return fail(res, 400, passwordPolicy.errors[0], "PASSWORD_POLICY_FAILED");
    }

    const tokenHash = hashToken(token);
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() }
    });
    if (!user) {
      recordAccountActionFailure("reset_password", tokenFingerprint);
      return fail(res, 400, "Invalid or expired password reset token", "RESET_TOKEN_INVALID");
    }

    user.password = hashPassword(password);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    user.loginAttempts = 0;
    user.lockedUntil = null;
    await user.save();

    await RefreshToken.updateMany(
      { subjectType: "user", subjectId: user._id.toString(), revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    await recordAudit({
      actorType: "user",
      actorId: user._id.toString(),
      actorEmail: user.email,
      action: "password_reset_completed",
      targetType: "session",
      targetId: "",
      targetEmail: user.email,
      reason: "password reset token consumed",
      ipAddress: getClientIp(req),
      metadata: {}
    });
    clearAccountActionFailures("reset_password", tokenFingerprint);

    return ok(res, {}, "Password reset successful. Please login again.");
  } catch (_err) {
    return fail(res, 500, "Failed to reset password", "RESET_PASSWORD_FAILED");
  }
});

userRouter.post("/login", userLoginRateLimiter, validateBody(userSchemas.login), async (req, res) => {
  try {
    const { email, password, otp } = req.body;
    if (isAccountActionBlocked("login", email, USER_ACCOUNT_GUARD_LOGIN_MAX)) {
      await alertSecurity(req, {
        eventType: "login_account_throttled",
        code: "LOGIN_LOCKED",
        actorType: "user",
        actorEmail: String(email || ""),
        reason: "per-account login throttle triggered"
      });
      return fail(res, 429, "Too many failed login attempts. Try again later.", "LOGIN_LOCKED");
    }

    const user = await User.findOne({ email });
    if (!user) {
      recordAccountActionFailure("login", email);
      await alertSecurity(req, {
        eventType: "login_invalid_credentials",
        code: "LOGIN_USER_NOT_FOUND",
        actorType: "user",
        actorEmail: String(email || ""),
        reason: "login with unknown email"
      });
      return fail(res, 401, "Invalid email or password", "INVALID_CREDENTIALS");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      recordAccountActionFailure("login", email);
      await alertSecurity(req, {
        eventType: "login_temporarily_locked",
        code: "LOGIN_LOCKED",
        actorType: "user",
        actorId: user._id.toString(),
        actorEmail: user.email,
        reason: "account temporarily locked due to repeated auth failures"
      });
      return fail(res, 429, "Too many failed login attempts. Try again later.", "LOGIN_LOCKED");
    }

    if (!verifyPassword(password, user.password)) {
      recordAccountActionFailure("login", email);
      await markUserAuthFailure(user);
      await alertSecurity(req, {
        eventType: "login_invalid_credentials",
        code: "LOGIN_BAD_PASSWORD",
        actorType: "user",
        actorId: user._id.toString(),
        actorEmail: user.email,
        reason: "invalid password"
      });
      return fail(res, 401, "Invalid email or password", "INVALID_CREDENTIALS");
    }
    if (needsPasswordMigration(user.password) && typeof user.save === "function") {
      user.password = hashPassword(password);
    }

    if (user.totpSecret) {
      if (!otp) {
        recordAccountActionFailure("login", email);
        await alertSecurity(req, {
          eventType: "login_missing_otp",
          code: "LOGIN_MISSING_OTP",
          actorType: "user",
          actorId: user._id.toString(),
          actorEmail: user.email,
          reason: "otp required but missing"
        });
        return fail(res, 401, "OTP required", "OTP_REQUIRED", {
          otpRequired: true,
          requiresOtp: true
        });
      }

      const verified = speakeasy.totp.verify({
        secret: user.totpSecret,
        encoding: "base32",
        token: otp,
        window: 1
      });

      if (!verified) {
        recordAccountActionFailure("login", email);
        await markUserAuthFailure(user);
        await alertSecurity(req, {
          eventType: "login_invalid_otp",
          code: "LOGIN_INVALID_OTP",
          actorType: "user",
          actorId: user._id.toString(),
          actorEmail: user.email,
          reason: "invalid otp"
        });
        return fail(res, 401, "Invalid OTP", "INVALID_OTP", {
          otpRequired: true,
          requiresOtp: true
        });
      }
    }

    clearAccountActionFailures("login", email);
    user.loginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date();
    await user.save();
    const ipAddress = getClientIp(req);
    const userAgent = String(req.headers["user-agent"] || "");
    const familyId = crypto.randomUUID();
    const access = createUserAccessToken(user);
    const refresh = await createUserRefreshTokenSession({
      user,
      familyId,
      ipAddress,
      userAgent
    });

    await recordAudit({
      actorType: "user",
      actorId: user._id.toString(),
      actorEmail: user.email,
      action: "login_success",
      targetType: "session",
      targetId: access.jti,
      targetEmail: user.email,
      reason: "user login",
      ipAddress,
      metadata: { userAgent }
    });

    setAuthCookies(res, "user", refresh.token, refresh.csrfToken);
    return ok(res, {
      message: "login successful",
      token: access.token,
      accessToken: access.token,
      tokenType: "Bearer",
      accessTokenTtl: USER_ACCESS_TOKEN_TTL,
      isFirstLogin: !!user.isFirstLogin
    }, "login successful");
  } catch (_err) {
    return fail(res, 500, "Login failed", "LOGIN_FAILED");
  }
});

userRouter.get("/auth/google", async (req, res) => {
  if (!ensureGoogleOAuthConfigured(res)) return;

  try {
    const state = createGoogleStateToken();
    const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    googleUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
    googleUrl.searchParams.set("response_type", "code");
    googleUrl.searchParams.set("scope", "openid email profile");
    googleUrl.searchParams.set("state", state);
    googleUrl.searchParams.set("access_type", "offline");
    googleUrl.searchParams.set("prompt", "select_account");
    return res.redirect(302, googleUrl.toString());
  } catch (_err) {
    return res.redirect(302, buildRedirectWithError(USER_OAUTH_FAILURE_REDIRECT, "oauth_start_failed"));
  }
});

userRouter.get("/auth/google/callback", async (req, res) => {
  if (!ensureGoogleOAuthConfigured(res)) return;

  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  const callbackError = String(req.query.error || "");

  if (callbackError) {
    return res.redirect(302, buildRedirectWithError(USER_OAUTH_FAILURE_REDIRECT, callbackError));
  }
  if (!code || !state) {
    return res.redirect(302, buildRedirectWithError(USER_OAUTH_FAILURE_REDIRECT, "missing_code_or_state"));
  }

  try {
    verifyGoogleStateToken(state);
    const tokenPayload = await exchangeGoogleCode(code);
    const profile = await fetchGoogleProfile(tokenPayload.access_token);
    const email = String(profile.email || "").toLowerCase().trim();
    if (!email) {
      return res.redirect(302, buildRedirectWithError(USER_OAUTH_FAILURE_REDIRECT, "google_email_missing"));
    }

    const givenName = String(profile.given_name || "").trim();
    const familyName = String(profile.family_name || "").trim();

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        firstname: givenName || "Google",
        lastname: familyName || "",
        email,
        password: hashPassword(randomStrongPassword())
      });
      await recordAudit({
        actorType: "user",
        actorId: user._id.toString(),
        actorEmail: email,
        action: "user_signup_google",
        targetType: "user",
        targetId: user._id.toString(),
        targetEmail: email,
        reason: "new account created via Google OAuth",
        ipAddress: getClientIp(req),
        metadata: {}
      });
    }

    if (user.status === "deleted") {
      return res.redirect(302, buildRedirectWithError(USER_OAUTH_FAILURE_REDIRECT, "account_deleted"));
    }
    if (user.status === "suspended") {
      return res.redirect(302, buildRedirectWithError(USER_OAUTH_FAILURE_REDIRECT, "account_suspended"));
    }

    user.loginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date();
    await user.save();

    const ipAddress = getClientIp(req);
    const userAgent = String(req.headers["user-agent"] || "");
    const familyId = crypto.randomUUID();
    const access = createUserAccessToken(user);
    const refresh = await createUserRefreshTokenSession({
      user,
      familyId,
      ipAddress,
      userAgent
    });

    await recordAudit({
      actorType: "user",
      actorId: user._id.toString(),
      actorEmail: user.email,
      action: "login_success_google",
      targetType: "session",
      targetId: access.jti,
      targetEmail: user.email,
      reason: "user login via Google OAuth",
      ipAddress,
      metadata: { userAgent }
    });

    setAuthCookies(res, "user", refresh.token, refresh.csrfToken);
    return res.redirect(302, USER_OAUTH_SUCCESS_REDIRECT);
  } catch (_err) {
    return res.redirect(302, buildRedirectWithError(USER_OAUTH_FAILURE_REDIRECT, "oauth_callback_failed"));
  }
});

userRouter.post("/refresh-token", userRefreshRateLimiter, validateBody(userSchemas.refresh), async (req, res) => {
  const refreshToken = getRefreshTokenFromCookies(req, "user");
  if (!refreshToken) {
    return fail(res, 400, "refresh token cookie is required", "REFRESH_MISSING");
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, JWT_SECRET);
  } catch (_err) {
    await alertSecurity(req, {
      eventType: "refresh_invalid_token",
      code: "REFRESH_INVALID",
      reason: "invalid or expired refresh token"
    });
    return fail(res, 401, "Invalid or expired refresh token", "REFRESH_INVALID");
  }

  if (payload.type !== "refresh" || !payload.familyId || !payload.jti) {
    await alertSecurity(req, {
      eventType: "refresh_invalid_token_type",
      code: "REFRESH_INVALID_TYPE",
      actorType: "user",
      actorId: String(payload.id || ""),
      actorEmail: String(payload.email || ""),
      reason: "invalid refresh token type"
    });
    return fail(res, 401, "Invalid token type", "REFRESH_INVALID_TYPE");
  }
  const refreshAccountKey = String(payload.email || payload.id || "");
  if (isAccountActionBlocked("refresh", refreshAccountKey, USER_ACCOUNT_GUARD_REFRESH_MAX)) {
    await alertSecurity(req, {
      eventType: "refresh_account_throttled",
      code: "REFRESH_INVALID",
      actorType: "user",
      actorId: String(payload.id || ""),
      actorEmail: String(payload.email || ""),
      reason: "per-account refresh throttle triggered"
    });
    return fail(res, 429, "Too many refresh attempts. Please log in again later.", "REFRESH_RATE_LIMITED");
  }

  try {
    const tokenHash = hashToken(refreshToken);
    const stored = await RefreshToken.findOne({
      tokenHash,
      subjectType: "user",
      subjectId: payload.id
    });

    if (!stored) {
      recordAccountActionFailure("refresh", refreshAccountKey);
      await alertSecurity(req, {
        eventType: "refresh_unrecognized_token",
        code: "REFRESH_UNKNOWN",
        actorType: "user",
        actorId: String(payload.id || ""),
        actorEmail: String(payload.email || ""),
        targetType: "session",
        targetId: String(payload.jti || ""),
        targetEmail: String(payload.email || ""),
        reason: "refresh token not recognized"
      });
      return fail(res, 401, "Refresh token not recognized", "REFRESH_UNKNOWN");
    }

    if (stored.familyId !== payload.familyId) {
      recordAccountActionFailure("refresh", refreshAccountKey);
      await revokeUserRefreshFamily(stored.familyId);
      await alertSecurity(req, {
        eventType: "refresh_family_mismatch",
        code: "SESSION_ANOMALY",
        actorType: "user",
        actorId: String(payload.id || ""),
        actorEmail: String(payload.email || ""),
        targetType: "session",
        targetId: String(payload.jti || ""),
        targetEmail: String(payload.email || ""),
        reason: "refresh token family mismatch"
      });
      return fail(res, 401, "Session anomaly detected. Please log in again.", "SESSION_ANOMALY");
    }

    const now = new Date();
    if (stored.revokedAt || stored.expiresAt <= now) {
      recordAccountActionFailure("refresh", refreshAccountKey);
      if (stored.revokedAt) {
        await revokeUserRefreshFamily(stored.familyId);
        await alertSecurity(req, {
          eventType: "refresh_reuse_detected",
          code: "REFRESH_REUSE",
          actorType: "user",
          actorId: String(payload.id || ""),
          actorEmail: String(payload.email || ""),
          targetType: "session",
          targetId: String(payload.jti || ""),
          targetEmail: String(payload.email || ""),
          reason: "refresh token reuse detected"
        });
      }
      return fail(res, 401, "Refresh token is no longer valid", "REFRESH_INVALID");
    }

    const csrfCheck = validateCsrf(req, "user", stored.csrfTokenHash);
    if (!csrfCheck.ok) {
      recordAccountActionFailure("refresh", refreshAccountKey);
      await alertSecurity(req, {
        eventType: "refresh_csrf_invalid",
        code: "CSRF_INVALID",
        actorType: "user",
        actorId: String(payload.id || ""),
        actorEmail: String(payload.email || ""),
        targetType: "session",
        targetId: String(payload.jti || ""),
        targetEmail: String(payload.email || ""),
        reason: csrfCheck.reason || "csrf validation failed"
      });
      return fail(res, 403, "Invalid CSRF token", "CSRF_INVALID");
    }

    const currentIpAddress = getClientIp(req);
    const currentUserAgent = String(req.headers["user-agent"] || "");
    const ipMismatch =
      stored.ipAddress && currentIpAddress && stored.ipAddress !== currentIpAddress;
    const userAgentMismatch =
      stored.userAgent && currentUserAgent && stored.userAgent !== currentUserAgent;
    if (ipMismatch || userAgentMismatch) {
      recordAccountActionFailure("refresh", refreshAccountKey);
      await revokeUserRefreshFamily(stored.familyId);
      await alertSecurity(req, {
        eventType: "refresh_session_anomaly",
        code: "SESSION_ANOMALY",
        actorType: "user",
        actorId: String(payload.id || ""),
        actorEmail: String(payload.email || ""),
        targetType: "session",
        targetId: String(payload.jti || ""),
        targetEmail: String(payload.email || ""),
        reason: "refresh token metadata mismatch detected"
      });
      return fail(res, 401, "Session anomaly detected. Please log in again.", "SESSION_ANOMALY");
    }

    const user = await User.findById(payload.id);
    if (!user) {
      recordAccountActionFailure("refresh", refreshAccountKey);
      await revokeUserRefreshFamily(stored.familyId);
      return fail(res, 401, "User account not found", "USER_NOT_FOUND");
    }

    const ipAddress = getClientIp(req);
    const userAgent = String(req.headers["user-agent"] || "");
    const nextRefresh = await createUserRefreshTokenSession({
      user,
      familyId: stored.familyId,
      ipAddress,
      userAgent
    });
    const access = createUserAccessToken(user);

    stored.revokedAt = now;
    stored.replacedByTokenHash = nextRefresh.tokenHash;
    await stored.save();

    await recordAudit({
      actorType: "user",
      actorId: user._id.toString(),
      actorEmail: user.email,
      action: "refresh_token_rotated",
      targetType: "session",
      targetId: payload.jti,
      targetEmail: user.email,
      reason: "refresh token rotation",
      ipAddress,
      metadata: { familyId: stored.familyId, userAgent }
    });

    setAuthCookies(res, "user", nextRefresh.token, nextRefresh.csrfToken);
    clearAccountActionFailures("refresh", refreshAccountKey);
    return ok(res, {
      accessToken: access.token,
      tokenType: "Bearer",
      accessTokenTtl: USER_ACCESS_TOKEN_TTL
    });
  } catch (_err) {
    recordAccountActionFailure("refresh", refreshAccountKey);
    return fail(res, 500, "Failed to rotate refresh token", "REFRESH_ROTATE_FAILED");
  }
});

userRouter.post("/logout", requireUserAuth, validateBody(userSchemas.logout), async (req, res) => {
  const csrfCheck = validateCsrf(req, "user");
  if (!csrfCheck.ok) {
    return fail(res, 403, "Invalid CSRF token", "CSRF_INVALID");
  }

  const refreshToken = getRefreshTokenFromCookies(req, "user");
  try {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await RefreshToken.updateOne(
        { tokenHash, subjectType: "user", subjectId: req.user.id, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
    }

    const authHeader = req.headers.authorization || "";
    const [, token] = authHeader.split(" ");
    if (token) {
      const decoded = jwt.decode(token);
      if (decoded?.jti && decoded?.exp) {
        await RevokedAccessToken.updateOne(
          { jti: decoded.jti, subjectType: "user", subjectId: req.user.id },
          { $setOnInsert: { expiresAt: new Date(decoded.exp * 1000) } },
          { upsert: true }
        );
      }
    }

    clearAuthCookies(res, "user");
    return ok(res, { message: "Logged out successfully" });
  } catch (_err) {
    return fail(res, 500, "Logout failed", "LOGOUT_FAILED");
  }
});

userRouter.post("/logout-all", requireUserAuth, validateBody(userSchemas.logout), async (req, res) => {
  const csrfCheck = validateCsrf(req, "user");
  if (!csrfCheck.ok) {
    return fail(res, 403, "Invalid CSRF token", "CSRF_INVALID");
  }

  try {
    await RefreshToken.updateMany(
      { subjectType: "user", subjectId: req.user.id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    if (req.user.jti) {
      const authHeader = req.headers.authorization || "";
      const [, token] = authHeader.split(" ");
      const decoded = token ? jwt.decode(token) : null;
      if (decoded?.exp) {
        await RevokedAccessToken.updateOne(
          { jti: req.user.jti, subjectType: "user", subjectId: req.user.id },
          { $setOnInsert: { expiresAt: new Date(decoded.exp * 1000) } },
          { upsert: true }
        );
      }
    }

    clearAuthCookies(res, "user");
    return ok(res, { message: "All sessions logged out" });
  } catch (_err) {
    return fail(res, 500, "Failed to logout all sessions", "LOGOUT_ALL_FAILED");
  }
});

// qrcode generation
userRouter.post("/generate-2fa", requireUserAuth, validateBody(userSchemas.emailOnly), async (req, res) => {
  try {
    const bodyEmail = String(req.body.email || "");
    const email = req.user.email;
    if (bodyEmail && bodyEmail.toLowerCase() !== email.toLowerCase()) {
      await alertSecurity(req, {
        eventType: "cross_user_generate_2fa_attempt",
        code: "CROSS_USER_2FA_SETUP",
        actorType: "user",
        actorId: req.user.id,
        actorEmail: req.user.email,
        targetType: "user",
        targetEmail: bodyEmail,
        reason: "generate-2fa body email mismatch"
      });
      return fail(res, 403, "Forbidden", "FORBIDDEN");
    }

    const user = await User.findOne({ email });
    if (!user) return fail(res, 404, "User not found", "USER_NOT_FOUND");
    if (user.isFirstLogin === false) {
      return fail(res, 403, "2FA setup is only allowed during first login.", "2FA_SETUP_NOT_ALLOWED");
    }
    if (user.totpSecret) {
      return fail(res, 400, "2FA already enabled.", "2FA_ALREADY_ENABLED");
    }

    const secret = speakeasy.generateSecret({ name: `Aeronox (${email})` });
    user.totpSecret = secret.base32;
    await user.save();

    qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
      if (err) return fail(res, 500, "QR generation failed", "QR_GENERATION_FAILED");
      return ok(res, { qr: data_url, secret: secret.base32 }, "2FA setup generated");
    });
  } catch (_err) {
    return fail(res, 500, "Internal server error", "INTERNAL_ERROR");
  }
});

// generate key pair
userRouter.post("/generate-keypair", requireUserAuth, validateBody(userSchemas.emailOnly), async (req, res) => {
  try {
    const bodyEmail = String(req.body.email || "");
    const email = req.user.email;
    if (bodyEmail && bodyEmail.toLowerCase() !== email.toLowerCase()) {
      await alertSecurity(req, {
        eventType: "cross_user_generate_keypair_attempt",
        code: "CROSS_USER_KEYGEN",
        actorType: "user",
        actorId: req.user.id,
        actorEmail: req.user.email,
        targetType: "user",
        targetEmail: bodyEmail,
        reason: "generate-keypair body email mismatch"
      });
      return fail(res, 403, "Forbidden", "FORBIDDEN");
    }

    const user = await User.findOne({ email });
    if (!user) return fail(res, 404, "User not found", "USER_NOT_FOUND");
    if (user.isFirstLogin === false) {
      return fail(res, 403, "Key generation is only allowed during first login.", "KEYGEN_NOT_ALLOWED");
    }
    if (user.publicKey) {
      return fail(res, 400, "Key pair already generated.", "KEYPAIR_EXISTS");
    }

    const kyber = new MlKem768();
    const [pkBytes, skBytes] = await kyber.generateKeyPair();
    const publicKey = Buffer.from(pkBytes).toString("base64");
    const secretKey = Buffer.from(skBytes).toString("base64");

    user.publicKey = publicKey;
    user.isFirstLogin = false;
    await user.save();

    return ok(res, { message: "Key pair generated successfully", publicKey, secretKey }, "Key pair generated successfully");
  } catch (_err) {
    return fail(res, 500, "Key generation failed", "KEYGEN_FAILED");
  }
});

// access request
userRouter.post("/request-access", userRequestAccessRateLimiter, requireUserAuth, validateBody(userSchemas.requestAccess), async (req, res) => {
  const { email: emailFromBody, fileId, description } = req.body;
  const email = req.user.email;
  if (emailFromBody && String(emailFromBody).toLowerCase() !== String(email).toLowerCase()) {
    await alertSecurity(req, {
      eventType: "cross_user_access_request_attempt",
      code: "CROSS_USER_REQUEST_ACCESS",
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      targetType: "user",
      targetEmail: String(emailFromBody),
      reason: "request-access body email mismatch"
    });
    return fail(res, 403, "Forbidden", "FORBIDDEN");
  }
  if (!fileId) {
    return fail(res, 400, "Missing fileId", "VALIDATION_ERROR");
  }

  try {
    const fileObjectId = new mongoose.Types.ObjectId(fileId);
    const filesCollection = mongoose?.connection?.db?.collection
      ? mongoose.connection.db.collection("uploads.files")
      : null;
    if (filesCollection) {
      const fileDoc = await filesCollection.findOne({ _id: fileObjectId });
      if (!fileDoc || fileDoc?.metadata?.deletedAt) {
        return fail(res, 410, "File no longer available.", "FILE_GONE");
      }
    } else if (typeof EncryptedFile?.findOne === "function") {
      const fallbackMeta = await EncryptedFile.findOne({ fileId: fileObjectId }, { isDeleted: 1 }).lean();
      if (fallbackMeta?.isDeleted) {
        return fail(res, 410, "File no longer available.", "FILE_GONE");
      }
    }

    const existing = await Request.findOne({ email, fileId: fileObjectId });
    if (existing && existing.status === "pending") {
      return fail(res, 409, "Access request already pending.", "REQUEST_DUPLICATE");
    }

    const request = new Request({
      email,
      fileId: fileObjectId,
      description: description || ""
    });
    await request.save();

    const responsePayload = {
      requestId: request._id
    };
    ok(res, responsePayload, "Access request sent to admin.");

    // Run notification fan-out after response so UI does not wait on email delivery latency.
    setImmediate(async () => {
      try {
        await notify({
          NotificationModel: Notification,
          recipientType: "user",
          recipientEmail: email,
          eventType: "request_submitted",
          title: "Access Request Submitted",
          message: "Your access request was submitted and is awaiting admin review.",
          metadata: {
            requestId: request._id.toString(),
            fileId: String(fileId)
          },
          emailSubject: "Aeronox access request submitted",
          emailText: "Your access request has been submitted and is waiting for admin review."
        });

        const admins = await Admin.find({}, { email: 1, _id: 0 }).lean();
        await Promise.all(
          admins.map((adminDoc) =>
            notify({
              NotificationModel: Notification,
              recipientType: "admin",
              recipientEmail: adminDoc.email,
              eventType: "request_submitted",
              title: "New Access Request",
              message: `A new access request was submitted by ${email}.`,
              metadata: {
                requestId: request._id.toString(),
                requesterEmail: email,
                fileId: String(fileId)
              },
              emailSubject: "New Aeronox access request",
              emailText: `User ${email} submitted a new access request.`
            })
          )
        );
      } catch (_notifyErr) {
        // Notification errors should not block request submission.
      }
    });
    return;
  } catch (_err) {
    return fail(res, 500, "Failed to request access.", "REQUEST_ACCESS_FAILED");
  }
});

// decrypt

userRouter.post("/decrypt", userDecryptRateLimiter, requireUserAuth, validateBody(userSchemas.decrypt), async (req, res) => {
  const gridfsBucket = getGridFSBucket();
  const { email: emailFromBody, fileId, secretKeyBase64, token } = req.body;
  const email = req.user.email;
  const decryptAccountKey = String(req.user.id || email || "");
  if (isAccountActionBlocked("decrypt", decryptAccountKey, USER_ACCOUNT_GUARD_DECRYPT_MAX)) {
    await alertSecurity(req, {
      eventType: "decrypt_account_throttled",
      code: "SESSION_ANOMALY",
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      reason: "per-account decrypt throttle triggered"
    });
    return fail(res, 429, "Too many decrypt attempts. Please try again later.", "DECRYPT_RATE_LIMITED");
  }

  if (emailFromBody && String(emailFromBody).toLowerCase() !== String(email).toLowerCase()) {
    recordAccountActionFailure("decrypt", decryptAccountKey);
    await alertSecurity(req, {
      eventType: "cross_user_decrypt_attempt",
      code: "CROSS_USER_DECRYPT",
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      targetType: "user",
      targetEmail: String(emailFromBody),
      reason: "decrypt body email mismatch"
    });
    return fail(res, 403, "Forbidden", "FORBIDDEN");
  }

  if (!fileId || !secretKeyBase64 || !token) {
    recordAccountActionFailure("decrypt", decryptAccountKey);
    return fail(res, 400, "Missing fileId, secret key, or OTP token.", "VALIDATION_ERROR");
  }

  try {
    // 1. Find user and verify OTP
    const user = await User.findOne({ email });
    if (!user || !user.totpSecret) {
      recordAccountActionFailure("decrypt", decryptAccountKey);
      return fail(res, 404, "User or TOTP secret not found.", "USER_NOT_FOUND");
    }

    const verified = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: "base32",
      token,
      window: 1
    });

    if (!verified) {
      recordAccountActionFailure("decrypt", decryptAccountKey);
      return fail(res, 401, "Invalid or expired OTP.", "INVALID_OTP");
    }

    const objectId = new mongoose.Types.ObjectId(fileId);

    // 2. Check access
    const access = await Request.findOne({
      email,
      fileId: objectId,
      status: "approved"
    });

    if (!access) {
      recordAccountActionFailure("decrypt", decryptAccountKey);
      return fail(res, 403, "Access not approved.", "ACCESS_NOT_APPROVED");
    }

    const now = new Date();
    if (access.expiresAt && now > access.expiresAt) {
      access.status = "expired";
      await access.save();
      try {
        await notify({
          NotificationModel: Notification,
          recipientType: "user",
          recipientEmail: email,
          eventType: "request_expired",
          title: "Access Request Expired",
          message: "Your approved request has expired. Please request access again.",
          metadata: {
            requestId: access._id.toString(),
            fileId: String(fileId),
            expiresAt: access.expiresAt || null
          },
          emailSubject: "Aeronox access expired",
          emailText: "Your approved access request expired. Please submit a new request."
        });
      } catch (_notifyErr) {
        // Ignore notification failures.
      }
      recordAccountActionFailure("decrypt", decryptAccountKey);
      return fail(res, 403, "Access expired. Please request again.", "ACCESS_EXPIRED");
    }

    // 3. Get encrypted metadata
    const encryptedData = await EncryptedFile.findOne({ fileId: objectId });
    if (!encryptedData) {
      recordAccountActionFailure("decrypt", decryptAccountKey);
      return fail(res, 404, "File metadata not found.", "FILE_METADATA_NOT_FOUND");
    }

    // 4. Kyber decapsulation
    const kyber = new MlKem768();
    const secretKey = Buffer.from(secretKeyBase64, "base64");
    const ciphertext = Buffer.from(
      encryptedData.encryptedAESKey,
      "base64"
    );

    const sharedSecret = await kyber.decap(ciphertext, secretKey);
    const aesKey = Buffer.from(sharedSecret);

    // 5. AES-GCM setup
    const iv = Buffer.from(encryptedData.iv, "base64");
    const authTag = Buffer.from(encryptedData.authTag, "base64");

    const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
    decipher.setAuthTag(authTag);

    // 6. Check file existence
    const files = await gridfsBucket.find({ _id: objectId }).toArray();
    if (!files.length) {
      recordAccountActionFailure("decrypt", decryptAccountKey);
      return fail(res, 404, "Encrypted file not found in GridFS.", "FILE_NOT_FOUND");
    }
    if (files[0]?.metadata?.deletedAt) {
      recordAccountActionFailure("decrypt", decryptAccountKey);
      return fail(res, 410, "File was removed by administrator.", "FILE_GONE");
    }

    const mimeType =
      files[0].metadata?.mimetype || "application/octet-stream";
    const watermarkTimestamp = new Date().toISOString();
    const sessionId = String(req.user?.jti || req.correlationId || crypto.randomUUID());
    const ipHash = crypto
      .createHash("sha256")
      .update(String(getClientIp(req) || "unknown"))
      .digest("hex")
      .slice(0, 16);

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", "inline; filename=\"secured-file\"");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Watermark-User", String(email));
    res.setHeader("X-Watermark-Timestamp", watermarkTimestamp);
    res.setHeader("X-Watermark-Session-Id", sessionId);
    res.setHeader("X-Watermark-Ip-Hash", ipHash);

    // --- Timers ---
    const decryptWindowSeconds = Math.round(USER_DECRYPT_VIEW_WINDOW_MS / 1000);
    const streamTimeoutSeconds = Math.round(USER_DECRYPT_STREAM_TIMEOUT_MS / 1000);
    const httpTimeout = setTimeout(() => {
      res.destroy();
      log("warn", "decrypt_stream_force_closed", {
        actorType: "user",
        actorEmail: email,
        fileId: String(fileId),
        windowSeconds: decryptWindowSeconds,
        streamTimeoutSeconds
      });
    }, USER_DECRYPT_STREAM_TIMEOUT_MS);

    // --- Stream decryption ---
    const readStream = gridfsBucket.openDownloadStream(objectId);

    readStream
      .pipe(decipher)
      .pipe(res)
      .on("finish", async () => {
        log("info", "decrypt_stream_completed", {
          actorType: "user",
          actorEmail: email,
          fileId: String(fileId),
          status: "completed"
        });
        clearTimeout(httpTimeout);
        access.status = "used";
        access.statusReason = "consumed after successful decrypt";
        await access.save();
        clearAccountActionFailures("decrypt", decryptAccountKey);
      })
      .on("error", async err => {
        log("error", "decrypt_stream_error", {
          actorType: "user",
          actorEmail: email,
          fileId: String(fileId),
          error: String(err?.message || err)
        });
        clearTimeout(httpTimeout);
        if (!res.headersSent) {
          return fail(res, 500, "Stream decryption failed.", "DECRYPT_STREAM_FAILED");
        }
      });
  } catch (err) {
    recordAccountActionFailure("decrypt", decryptAccountKey);
    log("error", "decrypt_failed", {
      actorType: "user",
      actorEmail: email,
      fileId: String(fileId),
      error: String(err?.message || err)
    });
    if (!res.headersSent) {
      return fail(res, 500, "Decryption failed.", "DECRYPT_FAILED");
    }
  }
});

userRouter.post("/security-events", requireUserAuth, validateBody(userSchemas.securityEvent), async (req, res) => {
  const { type, reason, fileId, status, metadata, occurredAt } = req.body;
  const actorEmail = req.user.email;
  const actorId = req.user.id;
  const ipAddress = getClientIp(req);
  const eventCode = SECURITY_EVENT_CODE_MAP[type] || "CLIENT_SECURITY_EVENT";
  const normalizedReason = String(reason || "client security signal").slice(0, 500);

  let sanitizedMetadata = {};
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    try {
      const json = JSON.stringify(metadata);
      sanitizedMetadata = JSON.parse(json.slice(0, 4000));
    } catch {
      sanitizedMetadata = {};
    }
  }

  try {
    await recordAudit({
      actorType: "user",
      actorId,
      actorEmail,
      action: "security_event_client",
      targetType: "session",
      targetId: req.user?.jti || "",
      targetEmail: actorEmail,
      reason: `${type}:${normalizedReason}`.slice(0, 500),
      ipAddress,
      metadata: {
        eventType: type,
        code: eventCode,
        fileId: fileId ? String(fileId) : "",
        status: status || "",
        occurredAt: occurredAt || new Date().toISOString(),
        ...sanitizedMetadata
      }
    });

    const shouldEscalate =
      type === "devtools_tamper" ||
      type === "multi_face_detected" ||
      type === "face_not_present" ||
      type === "screen_reflection_risk" ||
      type === "camera_aimed_at_screen" ||
      type === "rapid_scene_change" ||
      type === "monitoring_tamper";

    if (shouldEscalate) {
      await alertSecurity(req, {
        eventType: type,
        code: eventCode,
        actorType: "user",
        actorId,
        actorEmail,
        targetType: "session",
        targetId: req.user?.jti || "",
        targetEmail: actorEmail,
        reason: normalizedReason,
        metadata: {
          fileId: fileId ? String(fileId) : "",
          status: status || "",
          occurredAt: occurredAt || new Date().toISOString(),
          ...sanitizedMetadata
        }
      });
    } else {
      log("info", "user_security_event", {
        eventType: type,
        code: eventCode,
        actorType: "user",
        actorId,
        actorEmail,
        ipAddress,
        fileId: fileId ? String(fileId) : "",
        status: status || "",
        occurredAt: occurredAt || new Date().toISOString()
      });
      recordThreatEvent({
        code: eventCode,
        ipAddress,
        userAgent: String(req.headers["user-agent"] || ""),
        route: req.originalUrl || req.url || "",
        method: req.method || "",
        actorType: "user",
        actorId,
        actorEmail
      });
    }

    return ok(res, { accepted: true }, "Security event recorded.");
  } catch (_err) {
    return fail(res, 500, "Failed to record security event", "SECURITY_EVENT_FAILED");
  }
});


const listFilesForUser = async (req, res, email) => {
  try {
    if (!mongoose.connection.db) {
      return fail(res, 500, "Database not connected yet", "DB_UNAVAILABLE");
    }

    const filesCollection = mongoose.connection.db.collection("uploads.files");
    const now = new Date();
    const query = {
      "metadata.email": { $regex: `^${email}$`, $options: "i" },
      "metadata.deletedAt": { $exists: false }
    };

    const files = await filesCollection
      .find(query, { projection: { filename: 1, length: 1, "metadata.mimetype": 1 } })
      .toArray();

    if (!files || files.length === 0) {
      return ok(res, { files: [] });
    }

    const fileIds = files.map((file) => file._id);
    const requests = await Request.find({
      email,
      fileId: { $in: fileIds }
    })
      .sort({ updatedAt: -1 })
      .lean();

    const latestRequestByFileId = new Map();
    for (const request of requests) {
      const key = String(request.fileId);
      if (!latestRequestByFileId.has(key)) {
        latestRequestByFileId.set(key, request);
      }
    }

    // dedupe by id
    const seen = new Set();
    const result = [];
    for (const file of files) {
      const idStr = String(file._id);
      if (seen.has(idStr)) continue;
      seen.add(idStr);

      const latestRequest = latestRequestByFileId.get(idStr) || null;
      const requestStatus = String(latestRequest?.status || "none").toLowerCase();
      const isApproved = requestStatus === "approved";
      const isExpired =
        latestRequest?.expiresAt && new Date(latestRequest.expiresAt).getTime() <= now.getTime();
      const hasAccess = isApproved && !isExpired;

      result.push({
        filename: file.filename,
        type: file.metadata?.mimetype || "unknown",
        fileId: file._id,
        size: file.length || 0,
        requestStatus: hasAccess ? "approved" : requestStatus,
        hasAccess
      });
    }

    return ok(res, { files: result });
  } catch (_err) {
    return fail(res, 500, "Server error", "SERVER_ERROR");
  }
};

userRouter.get("/filelist", requireUserAuth, async (req, res) => {
  return listFilesForUser(req, res, req.user.email);
});

userRouter.get("/filelist/:email", requireUserAuth, validateParams(userSchemas.fileListParams), async (req, res) => {
  const requestedEmail = String(req.params.email || "");
  const email = req.user.email;
  if (requestedEmail.toLowerCase() !== email.toLowerCase()) {
    await alertSecurity(req, {
      eventType: "cross_user_filelist_attempt",
      code: "CROSS_USER_FILELIST",
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      targetType: "user",
      targetEmail: requestedEmail,
      reason: "filelist email path mismatch"
    });
    return fail(res, 403, "Forbidden", "FORBIDDEN");
  }
  return listFilesForUser(req, res, email);
});

userRouter.get("/requests", requireUserAuth, async (req, res) => {
  try {
    const requests = await Request.find({ email: req.user.email })
      .sort({ createdAt: -1 })
      .lean();

    const fileIds = requests
      .map((item) => item.fileId)
      .filter(Boolean);
    const files = await mongoose.connection.db.collection("uploads.files").find(
      { _id: { $in: fileIds } },
      { projection: { filename: 1, "metadata.deletedAt": 1 } }
    ).toArray();
    const fileMap = new Map(files.map((file) => [String(file._id), file]));

    const normalized = requests.map((item) => {
      const fileDoc = fileMap.get(String(item.fileId));
      const isFileRemoved =
        item.status === "file_removed" ||
        !fileDoc ||
        Boolean(fileDoc?.metadata?.deletedAt);
      const normalizedStatus = isFileRemoved ? "file_removed" : item.status;
      let statusMessage = "Request status updated.";
      if (isFileRemoved) {
        statusMessage = "File removed by administrator.";
      } else if (normalizedStatus === "approved") {
        statusMessage = "Request approved.";
      } else if (normalizedStatus === "rejected" || normalizedStatus === "denied") {
        statusMessage = "Request rejected.";
      } else if (normalizedStatus === "expired") {
        statusMessage = "Request expired.";
      } else if (normalizedStatus === "used") {
        statusMessage = "Request already used.";
      } else if (normalizedStatus === "pending") {
        statusMessage = "Request pending review.";
      }
      return {
        requestId: item._id,
        fileId: item.fileId,
        fileName: fileDoc?.filename || "Unavailable file",
        status: normalizedStatus,
        statusReason: item.statusReason || "",
        statusMessage,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      };
    });

    return ok(res, { requests: normalized });
  } catch (_err) {
    return fail(res, 500, "Failed to fetch requests", "REQUESTS_FETCH_FAILED");
  }
});

userRouter.get("/notifications", requireUserAuth, validateQuery(userSchemas.notificationsQuery), async (req, res) => {
  const limitRaw = Number(req.query.limit || 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
  const unreadOnly = req.query.unreadOnly === true || req.query.unreadOnly === "true";

  try {
    const filter = {
      recipientType: "user",
      recipientEmail: req.user.email
    };
    if (unreadOnly) {
      filter.readAt = null;
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return ok(res, { notifications });
  } catch (_err) {
    return fail(res, 500, "Failed to fetch notifications", "NOTIFICATIONS_FETCH_FAILED");
  }
});

userRouter.patch("/notifications/:notificationId/read", requireUserAuth, validateParams(userSchemas.notificationParams), async (req, res) => {
  const { notificationId } = req.params;

  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        recipientType: "user",
        recipientEmail: req.user.email
      },
      { $set: { readAt: new Date() } },
      { new: true }
    );

    if (!notification) {
      return fail(res, 404, "Notification not found", "NOTIFICATION_NOT_FOUND");
    }

    await recordAudit({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: "notification_read",
      targetType: "notification",
      targetId: notificationId,
      targetEmail: req.user.email,
      reason: "marked notification as read",
      ipAddress: getClientIp(req),
      metadata: {}
    });

    return ok(res, { notification });
  } catch (_err) {
    return fail(res, 500, "Failed to mark notification as read", "NOTIFICATION_UPDATE_FAILED");
  }
});

userRouter.post("/notifications/read-all", requireUserAuth, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        recipientType: "user",
        recipientEmail: req.user.email,
        readAt: null
      },
      { $set: { readAt: new Date() } }
    );

    await recordAudit({
      actorType: "user",
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: "notification_read_all",
      targetType: "notification",
      targetId: "",
      targetEmail: req.user.email,
      reason: "marked all notifications as read",
      ipAddress: getClientIp(req),
      metadata: { updatedCount: result.modifiedCount || 0 }
    });

    return ok(res, { updated: result.modifiedCount || 0 });
  } catch (_err) {
    return fail(res, 500, "Failed to mark all notifications as read", "NOTIFICATIONS_UPDATE_FAILED");
  }
});


module.exports = userRouter;





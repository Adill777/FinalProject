const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { MlKem768 } = require("mlkem");
const {Admin} = require('../models/db.js')
const adminRouter = express.Router();
const mongoose = require("mongoose");
const {User} = require("../models/db.js");
const{Request} = require('../models/db.js');
const {EncryptedFile, AuditLog, RefreshToken, RevokedAccessToken, Notification }= require("../models/db");
const { getGridFSBucket } = require("../models/db.js");
const jwt = require("jsonwebtoken");
const { notify } = require("../utils/notifications");
const { logAudit } = require("../utils/audit");
const { recordSecurityEvent } = require("../utils/security-alerts");
const { recordThreatEvent } = require("../utils/threat-protection");
const { log } = require("../utils/logger");
const { computeRetentionExpiry, computeSoftDeletePurgeAt, markFileAsSoftDeleted, restoreSoftDeletedFile } = require("../utils/governance");
const { validatePasswordPolicy } = require("../utils/password-policy");
const { hashPassword, verifyPassword, needsPasswordMigration } = require("../utils/password-hash");
const { validateBody, validateParams, validateQuery, adminSchemas } = require("../utils/validation");
const {
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromCookies,
  hashCsrfToken,
  validateCsrf,
  createCsrfToken
} = require("../utils/auth-cookies");

const FILE_SIZE_LIMITS = {
  "application/pdf": Number(process.env.UPLOAD_MAX_PDF_BYTES || 10 * 1024 * 1024),
  "image/png": Number(process.env.UPLOAD_MAX_IMAGE_BYTES || 5 * 1024 * 1024),
  "image/jpeg": Number(process.env.UPLOAD_MAX_IMAGE_BYTES || 5 * 1024 * 1024),
  "text/plain": Number(process.env.UPLOAD_MAX_TEXT_BYTES || 1 * 1024 * 1024)
};
const ALLOWED_MIME_TYPES = new Set(
  (process.env.UPLOAD_ALLOWED_MIME_TYPES || "application/pdf,image/png,image/jpeg,text/plain")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const MAX_UPLOAD_BYTES = Math.max(...Object.values(FILE_SIZE_LIMITS));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const mime = String(file?.mimetype || "").toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      return cb(new Error("Unsupported file type"));
    }
    return cb(null, true);
  }
});
const uploadSingleFile = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File exceeds allowed size limit" });
      }
      return res.status(400).json({ error: "Invalid upload request" });
    }
    return res.status(400).json({ error: err.message || "Invalid upload request" });
  });
};
const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV !== "production" ? crypto.randomBytes(32).toString("hex") : undefined);
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7);
const ADMIN_LOGIN_RATE_LIMIT_MAX = Number(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX || 10);
const ADMIN_REFRESH_RATE_LIMIT_MAX = Number(process.env.ADMIN_REFRESH_RATE_LIMIT_MAX || 30);
const ACCESS_APPROVAL_TTL_MS = Number(process.env.ACCESS_APPROVAL_TTL_MS || 60 * 60 * 1000);

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production");
}
if (!Number.isFinite(REFRESH_TOKEN_TTL_DAYS) || REFRESH_TOKEN_TTL_DAYS <= 0) {
  throw new Error("REFRESH_TOKEN_TTL_DAYS must be a positive number");
}
if (!Number.isFinite(ADMIN_LOGIN_RATE_LIMIT_MAX) || ADMIN_LOGIN_RATE_LIMIT_MAX <= 0) {
  throw new Error("ADMIN_LOGIN_RATE_LIMIT_MAX must be a positive number");
}
if (!Number.isFinite(ADMIN_REFRESH_RATE_LIMIT_MAX) || ADMIN_REFRESH_RATE_LIMIT_MAX <= 0) {
  throw new Error("ADMIN_REFRESH_RATE_LIMIT_MAX must be a positive number");
}
if (!Number.isFinite(ACCESS_APPROVAL_TTL_MS) || ACCESS_APPROVAL_TTL_MS <= 0) {
  throw new Error("ACCESS_APPROVAL_TTL_MS must be a positive number");
}

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const ok = (res, data = {}, message = "OK", statusCode = 200) => {
  const payload = data && typeof data === "object" && !Array.isArray(data) ? data : { value: data };
  return res.status(statusCode).json({ success: true, data: payload, error: null, code: "OK", message, ...payload });
};

const fail = (res, statusCode, error, code = "REQUEST_FAILED", data = null) => {
  if (typeof res.fail === "function") return res.fail(statusCode, error, code, data);
  return res.status(statusCode).json({ success: false, data, error, code });
};

const hasValidSignature = (mime, buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  if (mime === "application/pdf") {
    return buffer.slice(0, 5).toString("ascii") === "%PDF-";
  }
  if (mime === "image/png") {
    const signature = "89504e470d0a1a0a";
    return buffer.slice(0, 8).toString("hex").toLowerCase() === signature;
  }
  if (mime === "image/jpeg") {
    return (
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }
  if (mime === "text/plain") {
    // Plain text should not contain binary NUL bytes and should mostly be printable.
    if (buffer.includes(0x00)) return false;
    const printableCount = buffer.reduce((acc, byte) => {
      if (byte === 0x09 || byte === 0x0a || byte === 0x0d) return acc + 1;
      if (byte >= 0x20 && byte <= 0x7e) return acc + 1;
      return acc;
    }, 0);
    const printableRatio = printableCount / Math.max(buffer.length, 1);
    return printableRatio >= 0.85;
  }
  return false;
};

const hasDeepContentValidation = (mime, buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return false;
  if (mime === "application/pdf") {
    const tail = buffer.slice(Math.max(0, buffer.length - 1024)).toString("latin1");
    return tail.includes("%%EOF");
  }
  if (mime === "text/plain") {
    const utf8Text = buffer.toString("utf8");
    return !utf8Text.includes("\u0000");
  }
  return true;
};

const scanWithExternalAntivirus = async ({ fileBuffer, file }) => {
  const scanUrl = String(process.env.ANTIVIRUS_SCAN_URL || "").trim();
  if (!scanUrl) return { clean: true };
  if (typeof fetch !== "function") {
    return { clean: process.env.ANTIVIRUS_FAIL_CLOSED !== "true", reason: "runtime does not support fetch for AV scan" };
  }

  const timeoutMs = Number(process.env.ANTIVIRUS_SCAN_TIMEOUT_MS || 5000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const payload = {
      filename: String(file?.originalname || ""),
      mimeType: String(file?.mimetype || ""),
      size: Number(file?.size || 0),
      sha256: crypto.createHash("sha256").update(fileBuffer).digest("hex"),
      contentBase64:
        process.env.ANTIVIRUS_INCLUDE_CONTENT === "true"
          ? fileBuffer.toString("base64")
          : undefined
    };
    const response = await fetch(scanUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        clean: process.env.ANTIVIRUS_FAIL_CLOSED !== "true",
        reason: `external av scan failed with status ${response.status}`
      };
    }
    return {
      clean: body.clean !== false,
      reason: String(body.reason || "")
    };
  } catch (_err) {
    return {
      clean: process.env.ANTIVIRUS_FAIL_CLOSED !== "true",
      reason: "external av scan request failed"
    };
  } finally {
    clearTimeout(timeout);
  }
};

const scanUploadForMalware = async (fileBuffer, file) => {
  if (process.env.ANTIVIRUS_SCAN_ENABLED !== "true") {
    return { clean: true };
  }

  const eicarMarker = "EICAR-STANDARD-ANTIVIRUS-TEST-FILE";
  const asText = fileBuffer.toString("utf8");
  if (asText.includes(eicarMarker)) {
    return { clean: false, reason: "malware signature matched" };
  }

  const externalScan = await scanWithExternalAntivirus({ fileBuffer, file });
  if (!externalScan.clean) {
    return externalScan;
  }

  return { clean: true };
};

const quarantineUpload = async ({ req, file, reason }) => {
  if (process.env.ANTIVIRUS_QUARANTINE_ENABLED !== "true") return;
  await recordAudit({
    actorType: "admin",
    actorId: req.admin?.id || "",
    actorEmail: req.admin?.email || "",
    action: "upload_quarantined",
    targetType: "file",
    targetId: "",
    targetEmail: "",
    reason: reason || "upload quarantined by security policy",
    ipAddress: getClientIp(req),
    metadata: {
      filename: String(file?.originalname || ""),
      mimeType: String(file?.mimetype || ""),
      size: Number(file?.size || 0)
    }
  });
};

const adminLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: ADMIN_LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many admin login attempts. Please try again later." }
});

const adminRefreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: ADMIN_REFRESH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many refresh attempts. Please try again later." }
});
const ADMIN_BOOTSTRAP_TOKEN = String(process.env.ADMIN_BOOTSTRAP_TOKEN || "").trim();
const isProduction = process.env.NODE_ENV === "production";

const getAdminBootstrapToken = (req) => {
  const headerValue = req.headers["x-admin-bootstrap-token"];
  if (Array.isArray(headerValue)) {
    return String(headerValue[0] || "").trim();
  }
  if (typeof headerValue === "string" && headerValue.trim()) {
    return headerValue.trim();
  }
  const bodyValue = req.body && typeof req.body === "object" ? req.body.bootstrapToken : "";
  return String(bodyValue || "").trim();
};

const createAccessToken = (admin) => {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { id: admin._id.toString(), email: admin.email, role: "admin", type: "access", jti },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
  return { token, jti };
};

const createRefreshTokenSession = async ({ admin, familyId, ipAddress, userAgent }) => {
  const jti = crypto.randomUUID();
  const csrfToken = createCsrfToken();
  const token = jwt.sign(
    {
      id: admin._id.toString(),
      email: admin.email,
      role: "admin",
      type: "refresh",
      jti,
      familyId
    },
    JWT_SECRET,
    { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` }
  );
  const payload = jwt.decode(token);
  const expiresAt = payload?.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const tokenHash = hashToken(token);

  await RefreshToken.create({
    subjectType: "admin",
    subjectId: admin._id.toString(),
    subjectEmail: admin.email,
    tokenHash,
    csrfTokenHash: hashCsrfToken(csrfToken),
    familyId,
    expiresAt,
    ipAddress,
    userAgent
  });

  return { token, tokenHash, csrfToken };
};

const revokeRefreshFamily = async (familyId) => {
  if (!familyId) return;
  await RefreshToken.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
};

const requireAdminAuth = async (req, res, next) => {
  const ipAddress = getClientIp(req);
  const userAgent = String(req.headers["user-agent"] || "");

  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    await alertSecurity(req, {
      eventType: "admin_auth_missing_bearer",
      code: "AUTH_MISSING",
      reason: "missing bearer token"
    });
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== "access" || !payload.jti) {
      await alertSecurity(req, {
        eventType: "admin_auth_invalid_token_type",
        code: "AUTH_INVALID_TYPE",
        actorType: "admin",
        actorId: String(payload.id || ""),
        actorEmail: String(payload.email || ""),
        reason: "invalid access token type"
      });
      return res.status(401).json({ error: "Invalid token type" });
    }

    const revoked = await RevokedAccessToken.findOne({
      jti: payload.jti,
      subjectType: "admin",
      subjectId: payload.id
    });
    if (revoked) {
      await alertSecurity(req, {
        eventType: "admin_auth_revoked_access_token",
        code: "AUTH_REVOKED",
        actorType: "admin",
        actorId: String(payload.id || ""),
        actorEmail: String(payload.email || ""),
        targetType: "session",
        targetId: String(payload.jti || ""),
        targetEmail: String(payload.email || ""),
        reason: "revoked access token reuse"
      });
      return res.status(401).json({ error: "Token revoked" });
    }

    req.admin = {
      id: payload.id,
      email: payload.email,
      jti: payload.jti
    };
    return next();
  } catch (error) {
    await alertSecurity(req, {
      eventType: "admin_auth_invalid_or_expired",
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

// Durable expiry: mark expired approvals in DB based on expiresAt, no in-memory timers.
const expireStaleApprovals = async () => {
  const now = new Date();
  const stale = await Request.find(
    { status: "approved", expiresAt: { $lte: now } },
    { _id: 1, email: 1, fileId: 1, expiresAt: 1 }
  ).lean();

  if (stale.length === 0) return;

  await Request.updateMany(
    { _id: { $in: stale.map((r) => r._id) } },
    { $set: { status: "expired" } }
  );

  await Promise.all(
    stale.map((reqDoc) =>
      notify({
        NotificationModel: Notification,
        recipientType: "user",
        recipientEmail: reqDoc.email,
        eventType: "request_expired",
        title: "Access Request Expired",
        message: "Your approved access request expired. Please request access again.",
        metadata: {
          requestId: reqDoc._id.toString(),
          fileId: String(reqDoc.fileId),
          expiresAt: reqDoc.expiresAt || null
        },
        emailSubject: "Aeronox access request expired",
        emailText: "Your approved access request has expired. Please submit a new request if you still need access."
      })
    )
  );
};

//signup
adminRouter.post('/', validateBody(adminSchemas.signup), async(req,res)=>
{
    try{
        const{firstname,lastname,email,password}=req.body;
        if(!email || !password || !firstname){
            return fail(res, 400, "Missing required fields", "VALIDATION_ERROR");
        }
        if (isProduction) {
          if (!ADMIN_BOOTSTRAP_TOKEN) {
            return fail(
              res,
              503,
              "Admin provisioning is disabled until ADMIN_BOOTSTRAP_TOKEN is configured.",
              "ADMIN_PROVISIONING_DISABLED"
            );
          }
          const suppliedBootstrapToken = getAdminBootstrapToken(req);
          if (!suppliedBootstrapToken || suppliedBootstrapToken !== ADMIN_BOOTSTRAP_TOKEN) {
            await alertSecurity(req, {
              eventType: "admin_provisioning_denied",
              code: "ADMIN_BOOTSTRAP_TOKEN_INVALID",
              actorType: "admin",
              actorEmail: String(email || ""),
              reason: "invalid or missing admin bootstrap token"
            });
            return fail(
              res,
              403,
              "Admin provisioning requires a valid bootstrap token.",
              "ADMIN_BOOTSTRAP_TOKEN_INVALID"
            );
          }
        }
        const passwordPolicy = validatePasswordPolicy(password);
        if (!passwordPolicy.valid) {
          return fail(res, 400, passwordPolicy.errors[0], "WEAK_PASSWORD");
        }

        const existingadmin = await Admin.findOne({email:email});
        if(existingadmin){
            return fail(res, 409, "Admin already exists", "ADMIN_EXISTS");
        }
        const savedAdmin = await Admin.create({
            firstname,
            lastname,
            email,
            password: hashPassword(password)
        });
        return ok(res, {
            message : "admin created successfully",
            User : {
                id : savedAdmin.id,
                //firstname : savedUser.id,
                //lastname : savedUser.lastname,
                email : savedAdmin.email
            }
        }, "admin created successfully")
    
     } catch(error){
        return fail(res, 500, "Failed to create admin", "ADMIN_CREATE_FAILED");
        
    }
})

//login

adminRouter.post('/login', adminLoginRateLimiter, validateBody(adminSchemas.login), async(req,res)=>{
    try{
        const{email,password}=req.body;
        if (!email || !password) {
          return fail(res, 400, "Email and password are required", "VALIDATION_ERROR");
        }
        const Admindata = await Admin.findOne({email});
        if(!Admindata) {
            await alertSecurity(req, {
              eventType: "admin_login_invalid_credentials",
              code: "LOGIN_USER_NOT_FOUND",
              actorType: "admin",
              actorEmail: String(email || ""),
              reason: "login with unknown admin email"
            });
            return fail(res, 401, "Invalid email or password", "INVALID_CREDENTIALS");
        }
        if(!verifyPassword(password, Admindata.password)){
            await alertSecurity(req, {
              eventType: "admin_login_invalid_credentials",
              code: "LOGIN_BAD_PASSWORD",
              actorType: "admin",
              actorId: Admindata._id.toString(),
              actorEmail: Admindata.email,
              reason: "invalid admin password"
            });
            return fail(res, 401, "Invalid email or password", "INVALID_CREDENTIALS");
        }
        if (needsPasswordMigration(Admindata.password) && typeof Admindata.save === "function") {
          Admindata.password = hashPassword(password);
          await Admindata.save();
        }
        const ipAddress = getClientIp(req);
        const userAgent = String(req.headers["user-agent"] || "");
        const familyId = crypto.randomUUID();
        const access = createAccessToken(Admindata);
        const refresh = await createRefreshTokenSession({
          admin: Admindata,
          familyId,
          ipAddress,
          userAgent
        });

        setAuthCookies(res, "admin", refresh.token, refresh.csrfToken);
        await recordAudit({
          actorType: "admin",
          actorId: Admindata._id.toString(),
          actorEmail: Admindata.email,
          action: "login_success",
          targetType: "session",
          targetId: access.jti,
          targetEmail: Admindata.email,
          reason: "admin login",
          ipAddress,
          metadata: { userAgent }
        });
        return ok(res, {
          message : "login successfull",
          token: access.token,
          accessToken: access.token,
          tokenType: "Bearer",
          accessTokenTtl: ACCESS_TOKEN_TTL,
          admin: {
            id: Admindata._id,
            email: Admindata.email
          }
        }, "login successfull");
    }catch(error){
        return fail(res, 500, "Login failed", "LOGIN_FAILED");
    }
})

adminRouter.post("/refresh-token", adminRefreshRateLimiter, validateBody(adminSchemas.refresh), async (req, res) => {
  const refreshToken = getRefreshTokenFromCookies(req, "admin");
  if (!refreshToken) {
    return res.status(400).json({ error: "refresh token cookie is required" });
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, JWT_SECRET);
  } catch (err) {
    await alertSecurity(req, {
      eventType: "admin_refresh_invalid_token",
      code: "REFRESH_INVALID",
      reason: "invalid or expired refresh token"
    });
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }

  if (payload.type !== "refresh" || !payload.familyId || !payload.jti) {
    await alertSecurity(req, {
      eventType: "admin_refresh_invalid_token_type",
      code: "REFRESH_INVALID_TYPE",
      actorType: "admin",
      actorId: String(payload.id || ""),
      actorEmail: String(payload.email || ""),
      reason: "invalid refresh token type"
    });
    return res.status(401).json({ error: "Invalid token type" });
  }

  try {
    const tokenHash = hashToken(refreshToken);
    const stored = await RefreshToken.findOne({
      tokenHash,
      subjectType: "admin",
      subjectId: payload.id
    });

    if (!stored) {
      await alertSecurity(req, {
        eventType: "admin_refresh_unrecognized_token",
        code: "REFRESH_UNKNOWN",
        actorType: "admin",
        actorId: String(payload.id || ""),
        actorEmail: String(payload.email || ""),
        targetType: "session",
        targetId: String(payload.jti || ""),
        targetEmail: String(payload.email || ""),
        reason: "refresh token not recognized"
      });
      return res.status(401).json({ error: "Refresh token not recognized" });
    }
    if (stored.familyId !== payload.familyId) {
      await revokeRefreshFamily(stored.familyId);
      await alertSecurity(req, {
        eventType: "admin_refresh_family_mismatch",
        code: "SESSION_ANOMALY",
        actorType: "admin",
        actorId: String(payload.id || ""),
        actorEmail: String(payload.email || ""),
        targetType: "session",
        targetId: String(payload.jti || ""),
        targetEmail: String(payload.email || ""),
        reason: "refresh token family mismatch"
      });
      return res.status(401).json({ error: "Session anomaly detected. Please log in again." });
    }

    const now = new Date();
    if (stored.revokedAt || stored.expiresAt <= now) {
      if (stored.revokedAt) {
        await revokeRefreshFamily(stored.familyId);
        await alertSecurity(req, {
          eventType: "admin_refresh_reuse_detected",
          code: "REFRESH_REUSE",
          actorType: "admin",
          actorId: String(payload.id || ""),
          actorEmail: String(payload.email || ""),
          targetType: "session",
          targetId: String(payload.jti || ""),
          targetEmail: String(payload.email || ""),
          reason: "refresh token reuse detected"
        });
      } else {
        await alertSecurity(req, {
          eventType: "admin_refresh_expired_token",
          code: "REFRESH_EXPIRED",
          actorType: "admin",
          actorId: String(payload.id || ""),
          actorEmail: String(payload.email || ""),
          targetType: "session",
          targetId: String(payload.jti || ""),
          targetEmail: String(payload.email || ""),
          reason: "refresh token expired"
        });
      }
      return res.status(401).json({ error: "Refresh token is no longer valid" });
    }
    const csrfCheck = validateCsrf(req, "admin", stored.csrfTokenHash);
    if (!csrfCheck.ok) {
      await alertSecurity(req, {
        eventType: "admin_refresh_csrf_invalid",
        code: "CSRF_INVALID",
        actorType: "admin",
        actorId: String(payload.id || ""),
        actorEmail: String(payload.email || ""),
        targetType: "session",
        targetId: String(payload.jti || ""),
        targetEmail: String(payload.email || ""),
        reason: csrfCheck.reason || "csrf validation failed"
      });
      return res.status(403).json({ error: "Invalid CSRF token" });
    }

    const currentIpAddress = getClientIp(req);
    const currentUserAgent = String(req.headers["user-agent"] || "");
    const ipMismatch =
      stored.ipAddress && currentIpAddress && stored.ipAddress !== currentIpAddress;
    const userAgentMismatch =
      stored.userAgent && currentUserAgent && stored.userAgent !== currentUserAgent;
    if (ipMismatch || userAgentMismatch) {
      await revokeRefreshFamily(stored.familyId);
      await alertSecurity(req, {
        eventType: "admin_refresh_session_anomaly",
        code: "SESSION_ANOMALY",
        actorType: "admin",
        actorId: String(payload.id || ""),
        actorEmail: String(payload.email || ""),
        targetType: "session",
        targetId: String(payload.jti || ""),
        targetEmail: String(payload.email || ""),
        reason: "refresh token metadata mismatch detected"
      });
      return res.status(401).json({ error: "Session anomaly detected. Please log in again." });
    }

    const admin = await Admin.findById(payload.id);
    if (!admin) {
      await revokeRefreshFamily(stored.familyId);
      return res.status(401).json({ error: "Admin account not found" });
    }

    const ipAddress = getClientIp(req);
    const userAgent = String(req.headers["user-agent"] || "");
    const nextRefresh = await createRefreshTokenSession({
      admin,
      familyId: stored.familyId,
      ipAddress,
      userAgent
    });
    const access = createAccessToken(admin);

    stored.revokedAt = now;
    stored.replacedByTokenHash = nextRefresh.tokenHash;
    await stored.save();

    await recordAudit({
      actorType: "admin",
      actorId: admin._id.toString(),
      actorEmail: admin.email,
      action: "refresh_token_rotated",
      targetType: "session",
      targetId: payload.jti,
      targetEmail: admin.email,
      reason: "refresh token rotation",
      ipAddress,
      metadata: { familyId: stored.familyId, userAgent }
    });
    setAuthCookies(res, "admin", nextRefresh.token, nextRefresh.csrfToken);

    return res.status(200).json({
      accessToken: access.token,
      tokenType: "Bearer",
      accessTokenTtl: ACCESS_TOKEN_TTL
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to rotate refresh token" });
  }
});

// Protect all routes below this line.
adminRouter.use(requireAdminAuth);

adminRouter.post("/logout", requireAdminAuth, validateBody(adminSchemas.logout), async (req, res) => {
  const csrfCheck = validateCsrf(req, "admin");
  if (!csrfCheck.ok) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }
  const refreshToken = getRefreshTokenFromCookies(req, "admin");
  try {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await RefreshToken.updateOne(
        {
          tokenHash,
          subjectType: "admin",
          subjectId: req.admin.id,
          revokedAt: null
        },
        { $set: { revokedAt: new Date() } }
      );
    }

    const authHeader = req.headers.authorization || "";
    const [, token] = authHeader.split(" ");
    if (token) {
      const payload = jwt.decode(token);
      if (payload?.jti && payload?.exp) {
        await RevokedAccessToken.updateOne(
          {
            jti: payload.jti,
            subjectType: "admin",
            subjectId: req.admin.id
          },
          {
            $setOnInsert: {
              expiresAt: new Date(payload.exp * 1000)
            }
          },
          { upsert: true }
        );

        await recordAudit({
          actorType: "admin",
          actorId: req.admin.id,
          actorEmail: req.admin.email,
          action: "logout",
          targetType: "session",
          targetId: payload.jti,
          targetEmail: req.admin.email,
          reason: "single session logout",
          ipAddress: getClientIp(req),
          metadata: {}
        });
      }
    }

    clearAuthCookies(res, "admin");
    return res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    return res.status(500).json({ error: "Logout failed" });
  }
});

adminRouter.post("/logout-all", requireAdminAuth, async (req, res) => {
  const csrfCheck = validateCsrf(req, "admin");
  if (!csrfCheck.ok) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }
  try {
    await RefreshToken.updateMany(
      {
        subjectType: "admin",
        subjectId: req.admin.id,
        revokedAt: null
      },
      { $set: { revokedAt: new Date() } }
    );

    await recordAudit({
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      action: "logout_all",
      targetType: "session",
      targetId: req.admin.id,
      targetEmail: req.admin.email,
      reason: "all sessions logout",
      ipAddress: getClientIp(req),
      metadata: {}
    });

    if (req.admin.jti) {
      const authHeader = req.headers.authorization || "";
      const [, token] = authHeader.split(" ");
      const payload = token ? jwt.decode(token) : null;
      if (payload?.exp) {
        await RevokedAccessToken.updateOne(
          {
            jti: req.admin.jti,
            subjectType: "admin",
            subjectId: req.admin.id
          },
          {
            $setOnInsert: { expiresAt: new Date(payload.exp * 1000) }
          },
          { upsert: true }
        );
      }
    }

    clearAuthCookies(res, "admin");
    return res.status(200).json({ message: "All sessions logged out" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to logout all sessions" });
  }
});

adminRouter.get("/notifications", requireAdminAuth, validateQuery(adminSchemas.notificationsQuery), async (req, res) => {
  const limitRaw = Number(req.query.limit || 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
  const unreadOnly = req.query.unreadOnly === true || req.query.unreadOnly === "true";

  try {
    const filter = {
      recipientType: "admin",
      recipientEmail: req.admin.email
    };
    if (unreadOnly) {
      filter.readAt = null;
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({ notifications });
  } catch (_err) {
    return res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

adminRouter.patch("/notifications/:notificationId/read", requireAdminAuth, validateParams(adminSchemas.notificationParams), async (req, res) => {
  const { notificationId } = req.params;
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        recipientType: "admin",
        recipientEmail: req.admin.email
      },
      { $set: { readAt: new Date() } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    await recordAudit({
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      action: "notification_read",
      targetType: "notification",
      targetId: notificationId,
      targetEmail: req.admin.email,
      reason: "marked notification as read",
      ipAddress: getClientIp(req),
      metadata: {}
    });

    return res.status(200).json({ notification });
  } catch (_err) {
    return res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

adminRouter.post("/notifications/read-all", requireAdminAuth, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        recipientType: "admin",
        recipientEmail: req.admin.email,
        readAt: null
      },
      { $set: { readAt: new Date() } }
    );

    await recordAudit({
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      action: "notification_read_all",
      targetType: "notification",
      targetId: "",
      targetEmail: req.admin.email,
      reason: "marked all notifications as read",
      ipAddress: getClientIp(req),
      metadata: { updatedCount: result.modifiedCount || 0 }
    });

    return res.status(200).json({ updated: result.modifiedCount || 0 });
  } catch (_err) {
    return res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

//encrypt
adminRouter.post("/encrypt", requireAdminAuth, uploadSingleFile, validateBody(adminSchemas.encryptBody), async (req, res) => {
  const gridfsBucket = getGridFSBucket();
  const { email } = req.body;
  const file = req.file;

  if (!email || !file) {
    return res.status(400).json({ error: "Missing email or file." });
  }
  const mime = String(file.mimetype || "").toLowerCase();
  const maxSizeForMime = FILE_SIZE_LIMITS[mime] || 0;
  if (!ALLOWED_MIME_TYPES.has(mime) || maxSizeForMime <= 0) {
    return res.status(400).json({ error: "Unsupported file type." });
  }
  if (Number(file.size || 0) > maxSizeForMime) {
    return res.status(400).json({ error: "File exceeds per-type size limit." });
  }
  if (!hasValidSignature(mime, file.buffer)) {
    await alertSecurity(req, {
      eventType: "upload_signature_mismatch",
      code: "UPLOAD_SIGNATURE_INVALID",
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      reason: "uploaded file signature does not match mime type"
    });
    return res.status(400).json({ error: "File signature validation failed." });
  }
  if (!hasDeepContentValidation(mime, file.buffer)) {
    await alertSecurity(req, {
      eventType: "upload_content_validation_failed",
      code: "UPLOAD_SIGNATURE_INVALID",
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      reason: "uploaded file failed deep content validation"
    });
    return res.status(400).json({ error: "File content validation failed." });
  }
  const scanResult = await scanUploadForMalware(file.buffer, file);
  if (!scanResult.clean) {
    await quarantineUpload({
      req,
      file,
      reason: scanResult.reason || "malicious content detected in upload"
    });
    await alertSecurity(req, {
      eventType: "upload_malware_detected",
      code: "UPLOAD_MALWARE_DETECTED",
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      reason: scanResult.reason || "malicious content detected in upload"
    });
    return res.status(400).json({ error: "Uploaded file failed malware scan." });
  }

  try {
    // 1. Get user’s Kyber public key
    const user = await User.findOne({ email });
    if (!user || !user.publicKey) {
      return res.status(404).json({ error: "User or public key not found." });
    }
    const publicKey = Buffer.from(user.publicKey, "base64");

    // 2. Kyber encapsulation → ciphertext + sharedSecret (AES key)
    const kyber = new MlKem768();
    const [ciphertext, sharedSecret] = await kyber.encap(publicKey);
    const aesKey = Buffer.from(sharedSecret);

    // 3. Encrypt file with AES-256-GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
    const encryptedFile = Buffer.concat([cipher.update(file.buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // 4. Upload encrypted file to GridFS
    const uploadStream = gridfsBucket.openUploadStream(file.originalname, {
      metadata: {
        email,
        mimetype: mime,
        retentionDays: Number(process.env.FILE_RETENTION_DAYS || 90),
        expiresAt: computeRetentionExpiry(),
      },
    });

    uploadStream.end(encryptedFile);

    // 5. Wait until file is fully written
    uploadStream.on("finish", async () => {
      try {
        await EncryptedFile.create({
          fileId: uploadStream.id,
          encryptedAESKey: Buffer.from(ciphertext).toString("base64"),
          iv: iv.toString("base64"),
          authTag: authTag.toString("base64"),
          mimetype: mime, // ✅ keep mimetype here too
        });

        res.json({
          message: "✅ File encrypted and uploaded successfully.",
          fileId: uploadStream.id,
          filename: uploadStream.filename,
        });

        // log encryption event
        await recordAudit({
          actorType: "admin",
          actorId: req.admin.id,
          actorEmail: req.admin.email,
          action: "encrypt",
          targetType: "file",
          targetId: String(uploadStream.id),
          targetEmail: email,
          reason: "uploaded encrypted file",
          ipAddress: getClientIp(req),
          metadata: { filename: uploadStream.filename || "" }
        });
      } catch (err) {
        console.error("❌ Failed to save metadata:", err);
        res.status(500).json({ error: "Metadata save failed." });
      }
    });

    uploadStream.on("error", (err) => {
      console.error("🚨 GridFS upload error:", err);
      res.status(500).json({ error: "GridFS upload failed." });
    });

  } catch (err) {
    console.error("Encryption error:", err);
    res.status(500).json({ error: "Encryption failed: " + err.message });
  }
});

adminRouter.get("/files", requireAdminAuth, async (req, res) => {
  try {
    const filesCollection = mongoose.connection.db.collection("uploads.files");
    const includeDeleted = req.query.includeDeleted === "true";
    const fileFilter = includeDeleted ? {} : { "metadata.deletedAt": { $exists: false } };
    const files = await filesCollection
      .find(
        fileFilter,
        {
          projection: {
            filename: 1,
            length: 1,
            uploadDate: 1,
            "metadata.email": 1,
            "metadata.mimetype": 1,
            "metadata.expiresAt": 1,
            "metadata.deletedAt": 1,
            "metadata.purgeAt": 1,
            "metadata.deletionReason": 1
          }
        }
      )
      .sort({ uploadDate: -1 })
      .toArray();

    const mapped = files.map((file) => ({
      fileId: file._id,
      filename: file.filename || "",
      size: Number(file.length || 0),
      uploadDate: file.uploadDate || null,
      email: file.metadata?.email || "",
      mimeType: file.metadata?.mimetype || "application/octet-stream",
      expiresAt: file.metadata?.expiresAt || null,
      deletedAt: file.metadata?.deletedAt || null,
      purgeAt: file.metadata?.purgeAt || null,
      deletionReason: file.metadata?.deletionReason || ""
    }));

    return res.status(200).json({ files: mapped });
  } catch (_err) {
    return res.status(500).json({ error: "Failed to fetch uploaded files" });
  }
});

adminRouter.delete(
  "/files/:fileId",
  requireAdminAuth,
  validateParams(adminSchemas.fileIdParams),
  validateBody(adminSchemas.deleteFileBody),
  async (req, res) => {
    const { fileId } = req.params;
    const { reason } = req.body;
    const objectId = new mongoose.Types.ObjectId(fileId);

    try {
      const filesCollection = mongoose.connection.db.collection("uploads.files");
      const fileDoc = await filesCollection.findOne({ _id: objectId });
      if (!fileDoc) {
        return res.status(404).json({ error: "File not found." });
      }

      if (fileDoc?.metadata?.deletedAt) {
        return res.status(409).json({ error: "File is already scheduled for deletion." });
      }

      const impactedRequests = await Request.find({ fileId: objectId }, { email: 1 }).lean();
      const impactedEmails = [...new Set(impactedRequests.map((item) => String(item.email || "")).filter(Boolean))];
      const lifecycle = await markFileAsSoftDeleted({
        fileId: objectId,
        reason,
        adminEmail: req.admin.email
      });

      await recordAudit({
        actorType: "admin",
        actorId: req.admin.id,
        actorEmail: req.admin.email,
        action: "delete_file",
        targetType: "file",
        targetId: fileId,
        targetEmail: fileDoc?.metadata?.email || "",
        reason,
        ipAddress: getClientIp(req),
        metadata: {
          filename: fileDoc.filename || "",
          impactedRequests: impactedRequests.length
        }
      });

      await Promise.all(
        impactedEmails.map((email) =>
          notify({
            NotificationModel: Notification,
            recipientType: "user",
            recipientEmail: email,
            eventType: "file_deleted",
            title: "Protected File Removed",
            message: "A protected file tied to your requests was removed by an administrator.",
            metadata: {
              fileId,
              filename: fileDoc.filename || "",
              reason,
              purgeAt: lifecycle.purgeAt
            },
        emailSubject: "Aeronox file removed",
            emailText: `A protected file was removed by an administrator. Reason: ${reason}`
          })
        )
      );

      return res.status(200).json({
        message: "File scheduled for deletion.",
        fileId,
        removedRequests: impactedRequests.length,
        purgeAt: lifecycle.purgeAt,
        undoWindowHours: Number(process.env.FILE_SOFT_DELETE_WINDOW_HOURS || 24)
      });
    } catch (err) {
      if (err?.code === "FileNotFound" || String(err?.message || "").includes("FileNotFound")) {
        return res.status(404).json({ error: "File not found." });
      }
      return res.status(500).json({ error: "Failed to remove file." });
    }
  }
);

adminRouter.post(
  "/files/:fileId/restore",
  requireAdminAuth,
  validateParams(adminSchemas.fileIdParams),
  validateBody(adminSchemas.restoreFileBody),
  async (req, res) => {
    const { fileId } = req.params;
    const objectId = new mongoose.Types.ObjectId(fileId);
    try {
      const fileDoc = await mongoose.connection.db.collection("uploads.files").findOne({ _id: objectId });
      if (!fileDoc) {
        return res.status(404).json({ error: "File not found." });
      }
      if (!fileDoc?.metadata?.deletedAt) {
        return res.status(409).json({ error: "File is not in deleted state." });
      }

      await restoreSoftDeletedFile({ fileId: objectId });
      await Request.updateMany(
        { fileId: objectId, status: "file_removed" },
        { $set: { status: "pending", statusReason: "file restored by administrator" } }
      );

      await recordAudit({
        actorType: "admin",
        actorId: req.admin.id,
        actorEmail: req.admin.email,
        action: "restore_file",
        targetType: "file",
        targetId: fileId,
        targetEmail: fileDoc?.metadata?.email || "",
        reason: "restored within undo window",
        ipAddress: getClientIp(req),
        metadata: { filename: fileDoc.filename || "" }
      });

      return res.status(200).json({ message: "File restored successfully.", fileId });
    } catch (_err) {
      return res.status(500).json({ error: "Failed to restore file." });
    }
  }
);

adminRouter.post(
  "/files/bulk-delete",
  requireAdminAuth,
  validateBody(adminSchemas.bulkDeleteFilesBody),
  async (req, res) => {
    const { fileIds, reason } = req.body;
    const results = [];
    for (const fileId of fileIds) {
      const objectId = new mongoose.Types.ObjectId(fileId);
      try {
        const fileDoc = await mongoose.connection.db.collection("uploads.files").findOne({ _id: objectId });
        if (!fileDoc || fileDoc?.metadata?.deletedAt) {
          results.push({ fileId, deleted: false });
          continue;
        }
        const lifecycle = await markFileAsSoftDeleted({
          fileId: objectId,
          reason,
          adminEmail: req.admin.email
        });
        results.push({ fileId, deleted: true, purgeAt: lifecycle.purgeAt });
      } catch (_err) {
        results.push({ fileId, deleted: false });
      }
    }
    return res.status(200).json({
      message: "Bulk delete processed.",
      results
    });
  }
);

//request approval
// admin.js
adminRouter.post("/approve-access", requireAdminAuth, validateBody(adminSchemas.approveAccess), async (req, res) => {
    const { requestId } = req.body;

    if (!requestId) {
        return res.status(400).json({ error: "Missing requestId" });
    }

    try {
        await expireStaleApprovals();
        const request = await Request.findById(requestId);

        if (!request) {
            return res.status(404).json({ error: "Request not found." });
        }

        if (request.status === "approved") {
            return res.status(409).json({ error: "Request already approved." });
        }

        request.status = "approved";
        request.expiresAt = new Date(Date.now() + ACCESS_APPROVAL_TTL_MS);
        await request.save();

        res.status(200).json({
            message: "Access request approved.",
            requestId: request._id,
            expiresAt: request.expiresAt
        });

        // log approval
        await recordAudit({
          actorType: "admin",
          actorId: req.admin.id,
          actorEmail: req.admin.email,
          action: "approve_request",
          targetType: "request",
          targetId: request._id.toString(),
          targetEmail: request.email || "",
          reason: "approved access",
          ipAddress: getClientIp(req),
          metadata: { fileId: String(request.fileId) }
        });

        await notify({
          NotificationModel: Notification,
          recipientType: "user",
          recipientEmail: request.email || "",
          eventType: "request_approved",
          title: "Access Request Approved",
          message: "Your access request has been approved.",
          metadata: {
            requestId: request._id.toString(),
            fileId: String(request.fileId),
            expiresAt: request.expiresAt || null
          },
          emailSubject: "Aeronox access request approved",
          emailText: "Your access request has been approved. You can access the file until the approval expires."
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "❌ Failed to approve access request." });
    }
});

// reject request endpoint
adminRouter.post("/reject-request/:requestId", requireAdminAuth, validateParams(adminSchemas.rejectParams), async (req, res) => {
    const { requestId } = req.params;

    if (!requestId) {
        return res.status(400).json({ error: "Missing requestId" });
    }

    try {
        await expireStaleApprovals();
        const request = await Request.findById(requestId);

        if (!request) {
            return res.status(404).json({ error: "Request not found." });
        }

        if (request.status === "rejected" || request.status === "denied") {
            return res.status(409).json({ error: "Request already rejected." });
        }

        request.status = "rejected"; // update status in DB
        await request.save();

        res.status(200).json({
            message: "✅ Access request rejected.",
            requestId: request._id
        });

        // log rejection
        await recordAudit({
          actorType: "admin",
          actorId: req.admin.id,
          actorEmail: req.admin.email,
          action: "reject_request",
          targetType: "request",
          targetId: request._id.toString(),
          targetEmail: request.email || "",
          reason: "rejected access",
          ipAddress: getClientIp(req),
          metadata: { fileId: String(request.fileId) }
        });

        await notify({
          NotificationModel: Notification,
          recipientType: "user",
          recipientEmail: request.email || "",
          eventType: "request_rejected",
          title: "Access Request Rejected",
          message: "Your access request was rejected by an administrator.",
          metadata: {
            requestId: request._id.toString(),
            fileId: String(request.fileId)
          },
          emailSubject: "Aeronox access request rejected",
          emailText: "Your access request was rejected. Please contact an administrator if you need clarification."
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "❌ Failed to reject access request." });
    }
});

adminRouter.get("/pending-requests", requireAdminAuth, async (req, res) => {
    try {
        await expireStaleApprovals();
        const pendingRequests = await Request.find({
            status: { $in: ["pending", "approved", "rejected", "denied", "expired"] }
        })
            .sort({ requestedAt: -1, createdAt: -1 })
            .lean();

        // gather file ids and look up their GridFS entries for size
        const fileIds = pendingRequests.map(r => r.fileId);
        const files = await mongoose.connection.db.collection("uploads.files").find({
            _id: { $in: fileIds }
        }).toArray();

        const fileMap = new Map(files.map(f => [f._id.toString(), f]));

        const enriched = pendingRequests.map(r => {
            const fileDoc = fileMap.get(String(r.fileId));
            return {
                ...r,
                fileId: fileDoc || r.fileId,
                fileSize: fileDoc ? Number(fileDoc.length) : undefined
            };
        });

        res.status(200).json({
            message: "✅ Pending access requests fetched.",
            requests: enriched
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "❌ Failed to fetch pending requests." });
    }
});

adminRouter.get("/userlist", requireAdminAuth, async(req,res)=>{
    try{
        const userlist = await User.find(
          { status: { $ne: "deleted" } },
          "-password -__v"
        );
        res.json(userlist);

    }catch(err){
        console.error("error fetching users : ",err);
        res.status(500).json({ error : "Failed to fetch users" });
    }
});

// ✅ Get all users (for admin dashboard)
adminRouter.get("/users", requireAdminAuth, async (req, res) => {
  try {
    const users = await User.find(
      { status: { $ne: "deleted" } },
      "-password -publicKey -totpSecret"
    )
      .sort({ createdAt: -1 })
      .exec();

    res.status(200).json({
      message: "✅ Users fetched.",
      users
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch users." });
  }
});

// ✅ Suspend user
adminRouter.post("/users/:userId/suspend", requireAdminAuth, validateParams(adminSchemas.userIdParams), validateBody(adminSchemas.suspendBody), async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;
  const adminEmail = req.admin.email;
  const ipAddress = getClientIp(req);

  if (!reason || reason.length < 3) {
    return res.status(400).json({ error: "Reason required (min 3 chars)" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.email === adminEmail) {
      return res.status(403).json({ error: "Cannot suspend yourself." });
    }

    if (user.status === "suspended") {
      return res.status(409).json({ error: "User already suspended." });
    }

    user.status = "suspended";
    await user.save();

    // Log action
    await recordAudit({
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: adminEmail,
      action: "suspend",
      targetType: "user",
      targetId: user._id.toString(),
      targetEmail: user.email,
      reason,
      ipAddress,
      metadata: {}
    });

    await notify({
      NotificationModel: Notification,
      recipientType: "user",
      recipientEmail: user.email,
      eventType: "account_suspended",
      title: "Account Suspended",
      message: "Your account has been suspended by an administrator.",
      metadata: { reason },
      emailSubject: "Aeronox account suspended",
      emailText: `Your account has been suspended. Reason: ${reason}`
    });

    res.status(200).json({
      message: "✅ User suspended.",
      userId,
      status: "suspended"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to suspend user." });
  }
});

// ✅ Unsuspend user
adminRouter.post("/users/:userId/unsuspend", requireAdminAuth, validateParams(adminSchemas.userIdParams), async (req, res) => {
  const { userId } = req.params;
  const adminEmail = req.admin.email;
  const ipAddress = getClientIp(req);

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.status !== "suspended") {
      return res.status(409).json({ error: "User is not suspended." });
    }

    user.status = "active";
    user.loginAttempts = 0;
    user.lockedUntil = null;
    await user.save();

    // Log action
    await recordAudit({
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: adminEmail,
      action: "unsuspend",
      targetType: "user",
      targetId: user._id.toString(),
      targetEmail: user.email,
      reason: "",
      ipAddress,
      metadata: {}
    });

    await notify({
      NotificationModel: Notification,
      recipientType: "user",
      recipientEmail: user.email,
      eventType: "account_unsuspended",
      title: "Account Reactivated",
      message: "Your account has been reactivated by an administrator.",
      metadata: {},
      emailSubject: "Aeronox account reactivated",
      emailText: "Your account has been reactivated and you can log in again."
    });

    res.status(200).json({
      message: "✅ User unsuspended.",
      userId,
      status: "active"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to unsuspend user." });
  }
});

// ✅ Soft-delete user
adminRouter.delete("/users/:userId", requireAdminAuth, validateParams(adminSchemas.userIdParams), validateBody(adminSchemas.deleteBody), async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;
  const adminEmail = req.admin.email;
  const ipAddress = getClientIp(req);

  if (!reason || reason.length < 5) {
    return res.status(400).json({ error: "Reason required (min 5 chars)" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.email === adminEmail) {
      return res.status(403).json({ error: "Cannot delete your own account." });
    }

    user.status = "deleted";
    user.deletedAt = new Date();
    await user.save();

    // Log action
    await recordAudit({
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: adminEmail,
      action: "delete",
      targetType: "user",
      targetId: user._id.toString(),
      targetEmail: user.email,
      reason,
      ipAddress,
      metadata: {}
    });

    await notify({
      NotificationModel: Notification,
      recipientType: "user",
      recipientEmail: user.email,
      eventType: "account_deleted",
      title: "Account Deleted",
      message: "Your account has been deleted by an administrator.",
      metadata: { reason },
      emailSubject: "Aeronox account deleted",
      emailText: `Your account has been deleted. Reason: ${reason}`
    });

    res.status(200).json({
      message: "✅ User soft-deleted.",
      userId,
      status: "deleted"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete user." });
  }
});

// ✅ Get audit log
adminRouter.get("/audit-log", requireAdminAuth, async (req, res) => {
  try {
    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();

    res.status(200).json({
      message: "✅ Audit logs fetched.",
      logs
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch audit logs." });
  }
});

module.exports=adminRouter;



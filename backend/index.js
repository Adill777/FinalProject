const express = require("express");
const crypto = require("crypto");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const { log } = require("./utils/logger");

const stripWrappingQuotes = (value) => {
  const trimmed = String(value || "").trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const loadEnvFile = () => {
  const nodeEnv = String(process.env.NODE_ENV || "").trim();
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), ".env.local"),
    nodeEnv ? path.join(process.cwd(), `.env.${nodeEnv}`) : "",
    nodeEnv ? path.join(process.cwd(), `.env.${nodeEnv}.local`) : "",
    path.join(__dirname, ".env"),
    path.join(__dirname, ".env.local"),
    nodeEnv ? path.join(__dirname, `.env.${nodeEnv}`) : "",
    nodeEnv ? path.join(__dirname, `.env.${nodeEnv}.local`) : ""
  ];

  for (const filePath of candidates) {
    if (!filePath) continue;
    if (!fs.existsSync(filePath)) continue;

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const lines = raw.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex <= 0) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = stripWrappingQuotes(trimmed.slice(eqIndex + 1));
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
      return;
    } catch (_err) {
      // Keep startup resilient; env can also be supplied by process manager.
      return;
    }
  }
};

loadEnvFile();

const userRouter = require("./routes/user");
const adminRouter = require("./routes/admin");
const { User, Admin } = require("./models/db");
const { HASHED_PASSWORD_PATTERN } = require("./utils/password-policy");
const { startGovernanceJobs } = require("./utils/governance");

const app = express();
const port = Number(process.env.PORT) || 3000;
const trustProxy = process.env.TRUST_PROXY === "true";
const isProduction = process.env.NODE_ENV === "production";

const DEV_SECRET_VALUES = new Set([
  "replace-this-dev-secret",
  "changeme",
  "dev-secret",
  "test-secret",
  "secret",
  "jwt-secret"
]);
const PLACEHOLDER_SECRET_MARKERS = [
  "replace",
  "changeme",
  "example",
  "your_",
  "test"
];

const parseAllowedOrigins = () => {
  const envValue = String(process.env.CORS_ORIGINS || "");
  if (!envValue.trim()) return [];
  return envValue
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const ensureStrictProductionEnv = () => {
  if (!isProduction) return;

  const jwtSecret = String(process.env.JWT_SECRET || "").trim();
  if (!jwtSecret) {
    throw new Error("Startup blocked: JWT_SECRET is required in production.");
  }
  const weakSecret = DEV_SECRET_VALUES.has(jwtSecret.toLowerCase()) || jwtSecret.length < 32;
  if (weakSecret) {
    throw new Error("Startup blocked: JWT_SECRET appears weak or uses a dev/default value.");
  }

  const corsOrigins = parseAllowedOrigins();
  if (corsOrigins.length === 0) {
    throw new Error("Startup blocked: CORS_ORIGINS must be explicitly configured in production.");
  }

  if (process.env.COOKIE_SECURE !== "true") {
    throw new Error("Startup blocked: COOKIE_SECURE must be set to true in production.");
  }
  const cookieSameSite = String(process.env.COOKIE_SAME_SITE || "strict").trim().toLowerCase();
  if (cookieSameSite !== "strict") {
    throw new Error("Startup blocked: COOKIE_SAME_SITE must be strict in production.");
  }

  if (process.env.EMAIL_NOTIFICATIONS_ENABLED === "true") {
    const requiredSmtp = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
    const missing = requiredSmtp.filter((key) => !String(process.env[key] || "").trim());
    if (missing.length > 0) {
      throw new Error(`Startup blocked: missing SMTP config in production (${missing.join(", ")}).`);
    }
    const smtpPass = String(process.env.SMTP_PASS || "").trim().toLowerCase();
    if (PLACEHOLDER_SECRET_MARKERS.some((marker) => smtpPass.includes(marker))) {
      throw new Error("Startup blocked: SMTP_PASS appears to use a placeholder/dev value.");
    }
  }

  const googleClientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim().toLowerCase();
  if (googleClientSecret && PLACEHOLDER_SECRET_MARKERS.some((marker) => googleClientSecret.includes(marker))) {
    throw new Error("Startup blocked: GOOGLE_CLIENT_SECRET appears to use a placeholder/dev value.");
  }
};

// Strict CORS allowlist (comma-separated in env: CORS_ORIGINS=http://localhost:8081,http://localhost:8080)
const allowedOrigins = (() => {
  const fromEnv = parseAllowedOrigins();
  if (fromEnv.length > 0) return fromEnv;
  if (isProduction) return [];
  return ["http://localhost:8080", "http://localhost:8081", "http://localhost:5173"];
})();

const isDevLocalOrigin = (origin) => {
  if (isProduction || !origin) return false;
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    return ["localhost", "127.0.0.1"].includes(parsed.hostname);
  } catch {
    return false;
  }
};

const corsOptions = {
  origin(origin, callback) {
    // allow non-browser tools (no Origin header)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (isDevLocalOrigin(origin)) return callback(null, true);
    return callback(new Error("CORS: Origin not allowed"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
  exposedHeaders: [
    "X-Watermark-User",
    "X-Watermark-Timestamp",
    "X-Watermark-Session-Id",
    "X-Watermark-Ip-Hash"
  ],
  credentials: true,
};

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },
    referrerPolicy: { policy: "no-referrer" }
  })
);
app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), gyroscope=()"
  );
  next();
});
app.set("trust proxy", trustProxy);
app.use((req, res, next) => {
  const headerId = req.headers["x-correlation-id"];
  const correlationId =
    typeof headerId === "string" && headerId.trim()
      ? headerId.trim()
      : crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader("x-correlation-id", correlationId);
  next();
});
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use("/api", apiLimiter);
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (!(req.originalUrl || req.url || "").startsWith("/api")) {
      return originalJson(body);
    }

    if (body && typeof body === "object" && !Array.isArray(body) && Object.prototype.hasOwnProperty.call(body, "success")) {
      return originalJson(body);
    }

    const statusCode = res.statusCode || 200;
    if (statusCode >= 400) {
      const input = body && typeof body === "object" && !Array.isArray(body) ? body : {};
      const errorMessage = typeof input.error === "string"
        ? input.error
        : typeof input.message === "string"
          ? input.message
          : "Request failed";
      const normalized = {
        success: false,
        data: null,
        error: errorMessage,
        code: typeof input.code === "string" ? input.code : "REQUEST_FAILED",
        ...input
      };
      return originalJson(normalized);
    }

    const input = body && typeof body === "object" && !Array.isArray(body)
      ? body
      : { value: body };
    const normalized = {
      success: true,
      data: input,
      error: null,
      code: "OK",
      ...input
    };
    return originalJson(normalized);
  };

  res.success = (data = {}, message = "OK", statusCode = 200) =>
    res.status(statusCode).json({ success: true, data, message });
  res.fail = (statusCode, error, code = "UNKNOWN_ERROR", data = null) =>
    res.status(statusCode).json({ success: false, error, code, data });
  next();
});
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const forwarded = req.headers["x-forwarded-for"];
    let ipAddress = "";
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      ipAddress = forwarded[0];
    } else if (typeof forwarded === "string" && forwarded.length > 0) {
      ipAddress = forwarded.split(",")[0].trim();
    } else {
      ipAddress = req.ip || req.socket?.remoteAddress || "";
    }
    if (typeof ipAddress === "string" && ipAddress.startsWith("::ffff:")) {
      ipAddress = ipAddress.slice(7);
    }
    if (ipAddress === "::1") ipAddress = "127.0.0.1";

    log("info", "http_request", {
      correlationId: req.correlationId || "",
      method: req.method,
      route: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ipAddress: ipAddress || "unknown"
    });
  });
  next();
});

app.use('/api/user',userRouter);
app.use('/api/admin',adminRouter);
app.use((req, res) => res.status(404).json({ success: false, error: "Route not found", code: "NOT_FOUND" }));
app.use((err, req, res, _next) => {
  log("error", "unhandled_error", {
    correlationId: req.correlationId || "",
    route: req.originalUrl || req.url || "",
    message: err?.message || "Unhandled error"
  });
  return res.status(500).json({ success: false, error: "Internal server error", code: "INTERNAL_ERROR" });
});

const shouldEnforcePasswordGuard = () => {
  if (process.env.NODE_ENV !== "production") return false;
  if (process.env.PASSWORD_HASH_ENFORCEMENT === "true") return true;

  const migrationDeadline = process.env.PASSWORD_MIGRATION_DEADLINE;
  if (!migrationDeadline) return false;

  const deadline = new Date(migrationDeadline);
  if (Number.isNaN(deadline.getTime())) return false;
  return new Date() >= deadline;
};

const enforceNoPlaintextPasswords = async () => {
  if (!shouldEnforcePasswordGuard()) return;

  const query = { password: { $not: HASHED_PASSWORD_PATTERN } };
  const [plainUsers, plainAdmins] = await Promise.all([
    User.countDocuments(query),
    Admin.countDocuments(query)
  ]);

  if (plainUsers > 0 || plainAdmins > 0) {
    throw new Error(
      `Startup blocked: detected plaintext passwords (users=${plainUsers}, admins=${plainAdmins}).`
    );
  }
};

const start = async () => {
  try {
    ensureStrictProductionEnv();
    await enforceNoPlaintextPasswords();
    startGovernanceJobs();
    app.listen(port,()=>{
      log("info", "server_start", { message: `running on port ${port}` });
    });
  } catch (err) {
    log("error", "startup_error", {
      message: err instanceof Error ? err.message : String(err || "unknown startup error")
    });
    process.exit(1);
  }
};

void start();





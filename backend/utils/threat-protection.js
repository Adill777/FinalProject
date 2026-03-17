const { log } = require("./logger");

const attemptMap = new Map();
const blockMap = new Map();

const SCORE_WINDOW_MS = Number(process.env.THREAT_SCORE_WINDOW_MS || 30 * 60 * 1000);
const BLOCK_THRESHOLD = 5;
const BLOCK_DURATION_MS = Number(process.env.THREAT_BLOCK_DURATION_MS || 30 * 60 * 1000);

const EVENT_CODES = {
  AUTH_INVALID: 10,
  AUTH_MISSING: 2,
  AUTH_REVOKED: 15,
  REFRESH_INVALID: 12,
  REFRESH_REUSE: 30,
  SESSION_ANOMALY: 25,
  CSRF_INVALID: 18,
  RESET_ABUSE: 15,
  LOGIN_BAD_PASSWORD: 8,
  LOGIN_INVALID_OTP: 10,
  CROSS_USER_REQUEST_ACCESS: 20,
  CROSS_USER_DECRYPT: 25,
  CROSS_USER_FILELIST: 20,
  DEVTOOLS_TAMPER: 35,
  MULTI_FACE: 20,
  FACE_NOT_PRESENT: 15,
  SCREEN_REFLECTION: 20,
  CAMERA_AIMED_SCREEN: 35,
  RAPID_SCENE_CHANGE: 15,
  MONITORING_TAMPER: 25,
  CLIENT_SECURITY_EVENT: 2
};

const scopeFromRoute = (route = "") => {
  const normalized = String(route || "").toLowerCase();
  if (normalized.includes("/api/admin")) return "admin";
  if (normalized.includes("/api/user")) return "user";
  return "global";
};

const actorSubjectKey = ({ actorType = "", actorId = "", actorEmail = "" }) => {
  const type = String(actorType || "").trim().toLowerCase();
  const id = String(actorId || "").trim();
  const email = String(actorEmail || "").trim().toLowerCase();
  if (type && id) return `${type}:id:${id}`;
  if (type && email) return `${type}:email:${email}`;
  if (id) return `id:${id}`;
  if (email) return `email:${email}`;
  return "";
};

const makeKey = ({
  ipAddress,
  userAgent,
  scope = "global",
  actorType = "",
  actorId = "",
  actorEmail = ""
}) => {
  const actorKey = actorSubjectKey({ actorType, actorId, actorEmail });
  if (actorKey) return `${String(scope || "global")}::${actorKey}`;
  return `${String(scope || "global")}::${String(ipAddress || "unknown")}::${String(userAgent || "unknown")}`;
};

const recordThreatEvent = ({
  code,
  ipAddress,
  userAgent,
  route = "",
  method = "",
  actorType = "",
  actorId = "",
  actorEmail = ""
}) => {
  const isKnownSuspiciousCode = Boolean(EVENT_CODES[String(code || "").toUpperCase()]);
  if (!isKnownSuspiciousCode) return { blocked: false, attempts: 0 };

  const now = Date.now();
  const scope = scopeFromRoute(route);
  const key = makeKey({ ipAddress, userAgent, scope, actorType, actorId, actorEmail });
  const currentEvents = attemptMap.get(key) || [];
  const recentEvents = currentEvents.filter((timestamp) => now - timestamp <= SCORE_WINDOW_MS);
  recentEvents.push(now);
  attemptMap.set(key, recentEvents);
  const attemptCount = recentEvents.length;

  if (attemptCount >= BLOCK_THRESHOLD) {
    blockMap.set(key, now + BLOCK_DURATION_MS);
    log("warn", "threat_auto_block", {
      scope,
      actorType: String(actorType || ""),
      actorId: String(actorId || ""),
      actorEmail: String(actorEmail || ""),
      ipAddress,
      userAgent,
      route,
      method,
      code,
      attemptCount,
      blockThreshold: BLOCK_THRESHOLD,
      blockDurationMs: BLOCK_DURATION_MS
    });
    return { blocked: true, attempts: attemptCount };
  }

  return { blocked: false, attempts: attemptCount };
};

const isThreatBlocked = ({ ipAddress, userAgent, route = "", actorType = "", actorId = "", actorEmail = "" }) => {
  const scope = scopeFromRoute(route);
  const key = makeKey({ ipAddress, userAgent, scope, actorType, actorId, actorEmail });
  const until = blockMap.get(key);
  if (!until) return false;
  if (Date.now() > until) {
    blockMap.delete(key);
    return false;
  }
  return true;
};

module.exports = {
  recordThreatEvent,
  isThreatBlocked
};

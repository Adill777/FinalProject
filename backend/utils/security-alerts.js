const crypto = require("crypto");

const WINDOWED_EVENTS = {
  AUTH_INVALID: { threshold: 6, windowMs: 10 * 60 * 1000, cooldownMs: 10 * 60 * 1000, alertType: "repeated_auth_invalid" },
  REFRESH_INVALID: { threshold: 4, windowMs: 15 * 60 * 1000, cooldownMs: 15 * 60 * 1000, alertType: "repeated_refresh_invalid" },
  REFRESH_REUSE: { threshold: 2, windowMs: 60 * 60 * 1000, cooldownMs: 60 * 60 * 1000, alertType: "repeated_refresh_reuse" },
  SESSION_ANOMALY: { threshold: 2, windowMs: 30 * 60 * 1000, cooldownMs: 30 * 60 * 1000, alertType: "session_anomaly_pattern" },
  CSRF_INVALID: { threshold: 4, windowMs: 15 * 60 * 1000, cooldownMs: 15 * 60 * 1000, alertType: "csrf_attack_pattern" },
  RESET_ABUSE: { threshold: 3, windowMs: 15 * 60 * 1000, cooldownMs: 15 * 60 * 1000, alertType: "password_reset_abuse" },
  DEVTOOLS_TAMPER: { threshold: 2, windowMs: 10 * 60 * 1000, cooldownMs: 10 * 60 * 1000, alertType: "devtools_tamper_pattern" },
  CAMERA_AIMED_SCREEN: { threshold: 2, windowMs: 10 * 60 * 1000, cooldownMs: 10 * 60 * 1000, alertType: "camera_capture_pattern" },
  SCREEN_REFLECTION: { threshold: 3, windowMs: 15 * 60 * 1000, cooldownMs: 15 * 60 * 1000, alertType: "screen_reflection_pattern" },
  MONITORING_TAMPER: { threshold: 2, windowMs: 10 * 60 * 1000, cooldownMs: 10 * 60 * 1000, alertType: "monitoring_tamper_pattern" }
};

const eventWindows = new Map();
const eventCooldowns = new Map();

const keyFor = ({ code, ipAddress, userAgent }) => {
  const uaHash = crypto
    .createHash("sha256")
    .update(String(userAgent || ""))
    .digest("hex")
    .slice(0, 16);
  return `${String(code || "UNKNOWN")}|${String(ipAddress || "unknown")}|${uaHash}`;
};

const recordSecurityEvent = ({ code, ipAddress, userAgent }) => {
  const policy = WINDOWED_EVENTS[code];
  if (!policy) return null;

  const now = Date.now();
  const key = keyFor({ code, ipAddress, userAgent });
  const current = eventWindows.get(key) || [];
  const recent = current.filter((ts) => now - ts <= policy.windowMs);
  recent.push(now);
  eventWindows.set(key, recent);

  if (recent.length < policy.threshold) return null;

  const lastAlertTs = eventCooldowns.get(key) || 0;
  if (now - lastAlertTs < policy.cooldownMs) return null;
  eventCooldowns.set(key, now);

  return {
    code,
    alertType: policy.alertType,
    count: recent.length,
    windowMs: policy.windowMs
  };
};

module.exports = {
  recordSecurityEvent
};

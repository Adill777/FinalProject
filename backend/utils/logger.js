const LEVEL_ORDER = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const defaultLevelByEnv =
  process.env.NODE_ENV === "production"
    ? "info"
    : process.env.NODE_ENV === "test"
      ? "error"
      : "debug";
const configuredLevel = String(process.env.LOG_LEVEL || defaultLevelByEnv).toLowerCase();
const minLevel = LEVEL_ORDER[configuredLevel] ?? LEVEL_ORDER.info;
const serviceName = process.env.SERVICE_NAME || "freqvault-backend";

const shouldLog = (level) => {
  const value = LEVEL_ORDER[String(level || "info").toLowerCase()];
  if (value === undefined) return false;
  return value <= minLevel;
};

const formatPayload = (level, type, payload = {}) => ({
  ts: new Date().toISOString(),
  level,
  service: serviceName,
  env: process.env.NODE_ENV || "development",
  type: type || "application_log",
  ...payload
});

const log = (level, type, payload = {}) => {
  if (!shouldLog(level)) return;
  const line = JSON.stringify(formatPayload(level, type, payload));
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
};

module.exports = {
  log
};

const crypto = require("crypto");
const { isHashedPassword } = require("./password-policy");

const SCRYPT_PREFIX = "scrypt";
const SCRYPT_PARAMS = {
  cost: 16384,
  blockSize: 8,
  parallelization: 1,
  keyLength: 64
};

const toBuffer = (value, encoding) => {
  try {
    return Buffer.from(String(value || ""), encoding);
  } catch {
    return Buffer.alloc(0);
  }
};

const encodeToken = (buffer) => buffer.toString("base64url");

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(String(password || ""), salt, SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.cost,
    r: SCRYPT_PARAMS.blockSize,
    p: SCRYPT_PARAMS.parallelization
  });

  return [
    SCRYPT_PREFIX,
    SCRYPT_PARAMS.cost,
    SCRYPT_PARAMS.blockSize,
    SCRYPT_PARAMS.parallelization,
    encodeToken(salt),
    encodeToken(derivedKey)
  ].join("$");
};

const parseScryptHash = (value) => {
  const parts = String(value || "").split("$");
  if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) return null;

  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelization = Number(parts[3]);
  const salt = toBuffer(parts[4], "base64url");
  const expectedKey = toBuffer(parts[5], "base64url");

  if (!Number.isFinite(cost) || !Number.isFinite(blockSize) || !Number.isFinite(parallelization)) {
    return null;
  }
  if (salt.length === 0 || expectedKey.length === 0) {
    return null;
  }

  return {
    cost,
    blockSize,
    parallelization,
    salt,
    expectedKey
  };
};

const verifyPassword = (password, storedPassword) => {
  if (typeof storedPassword !== "string" || !storedPassword) return false;

  if (!isHashedPassword(storedPassword)) {
    return storedPassword === String(password || "");
  }

  const parsed = parseScryptHash(storedPassword);
  if (!parsed) {
    return false;
  }

  const derivedKey = crypto.scryptSync(String(password || ""), parsed.salt, parsed.expectedKey.length, {
    N: parsed.cost,
    r: parsed.blockSize,
    p: parsed.parallelization
  });

  return crypto.timingSafeEqual(parsed.expectedKey, derivedKey);
};

const needsPasswordMigration = (storedPassword) =>
  typeof storedPassword === "string" && storedPassword.length > 0 && !isHashedPassword(storedPassword);

module.exports = {
  hashPassword,
  verifyPassword,
  needsPasswordMigration
};

const COMMON_PASSWORDS = new Set([
  "password",
  "password123",
  "123456",
  "12345678",
  "qwerty",
  "qwerty123",
  "admin",
  "admin123",
  "welcome",
  "letmein",
  "abc123",
  "iloveyou",
  "monkey",
  "dragon",
  "baseball",
  "football",
  "master",
  "sunshine",
  "princess",
  "freedom"
]);

const MIN_PASSWORD_LENGTH = 12;

const validatePasswordPolicy = (password) => {
  const errors = [];
  const value = typeof password === "string" ? password : "";
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (value.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }
  if (!/[A-Z]/.test(value)) {
    errors.push("Password must include at least one uppercase letter");
  }
  if (!/[a-z]/.test(value)) {
    errors.push("Password must include at least one lowercase letter");
  }
  if (!/\d/.test(value)) {
    errors.push("Password must include at least one number");
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    errors.push("Password must include at least one special character");
  }
  if (COMMON_PASSWORDS.has(normalized)) {
    errors.push("Password is too common and not allowed");
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

const HASHED_PASSWORD_PATTERN = /^(?:\$2[aby]\$\d{2}\$|\$argon2(?:id|i|d)\$)/;

const isHashedPassword = (value) =>
  typeof value === "string" && HASHED_PASSWORD_PATTERN.test(value);

module.exports = {
  validatePasswordPolicy,
  MIN_PASSWORD_LENGTH,
  HASHED_PASSWORD_PATTERN,
  isHashedPassword
};

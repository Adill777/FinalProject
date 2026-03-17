const { validatePasswordPolicy, MIN_PASSWORD_LENGTH, isHashedPassword } = require("../utils/password-policy");

describe("Password policy", () => {
  test("accepts strong password", () => {
    const result = validatePasswordPolicy("Stronger#Pass123");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects short password", () => {
    const result = validatePasswordPolicy("S#1short");
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain(String(MIN_PASSWORD_LENGTH));
  });

  test("rejects missing complexity rules", () => {
    const result = validatePasswordPolicy("alllowercasepassword!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password must include at least one uppercase letter");
    expect(result.errors).toContain("Password must include at least one number");
  });

  test("rejects common blocked password", () => {
    const result = validatePasswordPolicy("Password123!");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Password is too common and not allowed");
  });
});

describe("Password hash detection", () => {
  test("detects bcrypt prefix as hashed", () => {
    expect(isHashedPassword("$2b$10$abcdefghijklmnopqrstuvwxyzABCDEabcdeABCDEabcdeABCD")).toBe(true);
  });

  test("detects argon2 prefix as hashed", () => {
    expect(isHashedPassword("$argon2id$v=19$m=65536,t=3,p=4$abc$def")).toBe(true);
  });

  test("detects plaintext as non-hashed", () => {
    expect(isHashedPassword("PlainTextPassword!1")).toBe(false);
  });
});

describe("Planned auth migration behavior", () => {
  test.todo("auth login accepts hashed passwords");
  test.todo("legacy plaintext password is auto-migrated to hash on successful login");
});

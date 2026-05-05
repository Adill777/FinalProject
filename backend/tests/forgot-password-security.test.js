const express = require("express");
const request = require("supertest");
const crypto = require("crypto");
const { isHashedPassword } = require("../utils/password-policy");

describe("Forgot password security controls", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = "test-secret";
    process.env.NODE_ENV = "test";
    process.env.USER_PASSWORD_RESET_MIN_INTERVAL_MS = "60000";
  });

  test("forgot-password applies per-account minimum interval throttling", async () => {
    const recentUser = {
      _id: "u-reset-1",
      email: "reset@example.com",
      password: "user-pass",
      passwordResetRequestedAt: new Date(),
      save: jest.fn()
    };

    const dbMock = {
      User: {
        findOne: jest.fn(async ({ email }) => (email === "reset@example.com" ? recentUser : null)),
        findById: jest.fn()
      },
      AuditLog: { create: jest.fn() },
      Admin: { find: jest.fn().mockResolvedValue([]) },
      Request: { findOne: jest.fn(), find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) },
      EncryptedFile: { findOne: jest.fn() },
      Notification: {
        create: jest.fn(),
        find: jest.fn(() => ({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([])
        })),
        findOneAndUpdate: jest.fn(),
        updateMany: jest.fn()
      },
      RefreshToken: { create: jest.fn(), findOne: jest.fn(), updateOne: jest.fn(), updateMany: jest.fn() },
      RevokedAccessToken: { findOne: jest.fn().mockResolvedValue(null), updateOne: jest.fn() },
      getGridFSBucket: jest.fn()
    };

    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);

    const userRouter = require("../routes/user");
    const app = express();
    app.use(express.json());
    app.use("/api/user", userRouter);

    const res = await request(app).post("/api/user/forgot-password").send({ email: "reset@example.com" });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("RESET_RATE_LIMITED");
    expect(recentUser.save).not.toHaveBeenCalled();
  });

  test("reset-password consumes token once, revokes sessions, and writes audit event", async () => {
    const token = "test-reset-token-value";
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const userDoc = {
      _id: "u-reset-2",
      email: "reset2@example.com",
      password: "old-password",
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
      loginAttempts: 2,
      lockedUntil: new Date(Date.now() + 60_000),
      save: jest.fn().mockResolvedValue(undefined)
    };

    const dbMock = {
      User: {
        findOne: jest.fn(async (query) => {
          if (query && query.passwordResetTokenHash === tokenHash) return userDoc;
          return null;
        }),
        findById: jest.fn()
      },
      AuditLog: { create: jest.fn().mockResolvedValue(undefined) },
      Admin: { find: jest.fn().mockResolvedValue([]) },
      Request: { findOne: jest.fn(), find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) },
      EncryptedFile: { findOne: jest.fn() },
      Notification: {
        create: jest.fn(),
        find: jest.fn(() => ({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([])
        })),
        findOneAndUpdate: jest.fn(),
        updateMany: jest.fn()
      },
      RefreshToken: {
        create: jest.fn(),
        findOne: jest.fn(),
        updateOne: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 })
      },
      RevokedAccessToken: { findOne: jest.fn().mockResolvedValue(null), updateOne: jest.fn() },
      getGridFSBucket: jest.fn()
    };

    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);

    const userRouter = require("../routes/user");
    const app = express();
    app.use(express.json());
    app.use("/api/user", userRouter);

    const res = await request(app).post("/api/user/reset-password").send({
      token,
      password: "StrongPass#1234"
    });

    expect(res.status).toBe(200);
    expect(userDoc.save).toHaveBeenCalled();
    expect(isHashedPassword(userDoc.password)).toBe(true);
    expect(userDoc.passwordResetTokenHash).toBeNull();
    expect(userDoc.passwordResetExpiresAt).toBeNull();
    expect(dbMock.RefreshToken.updateMany).toHaveBeenCalled();
    expect(dbMock.AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: "password_reset_completed",
      actorEmail: "reset2@example.com"
    }));
  });

  test("cross-user denial applies to generate-2fa and generate-keypair routes", async () => {
    const userDoc = {
      _id: "u-cross-1",
      email: "usera@example.com",
      password: "pass-a",
      totpSecret: null,
      isFirstLogin: true,
      save: jest.fn().mockResolvedValue(undefined)
    };

    const dbMock = {
      User: {
        findOne: jest.fn(async ({ email }) => (email === "usera@example.com" ? userDoc : null)),
        findById: jest.fn(async () => userDoc)
      },
      AuditLog: { create: jest.fn().mockResolvedValue(undefined) },
      Admin: { find: jest.fn().mockResolvedValue([]) },
      Request: { findOne: jest.fn(), find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) },
      EncryptedFile: { findOne: jest.fn() },
      Notification: {
        create: jest.fn(),
        find: jest.fn(() => ({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([])
        })),
        findOneAndUpdate: jest.fn(),
        updateMany: jest.fn()
      },
      RefreshToken: { create: jest.fn(), findOne: jest.fn(), updateOne: jest.fn(), updateMany: jest.fn() },
      RevokedAccessToken: { findOne: jest.fn().mockResolvedValue(null), updateOne: jest.fn() },
      getGridFSBucket: jest.fn()
    };

    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);
    jest.doMock("qrcode", () => ({ toDataURL: jest.fn((_url, cb) => cb(null, "data:image/png;base64,x")) }));
    jest.doMock("speakeasy", () => ({
      totp: { verify: jest.fn(() => true) },
      generateSecret: jest.fn(() => ({ base32: "SECRET", otpauth_url: "otpauth://test" }))
    }));

    const userRouter = require("../routes/user");
    const app = express();
    app.use(express.json());
    app.use("/api/user", userRouter);

    const login = await request(app).post("/api/user/login").send({
      email: "usera@example.com",
      password: "pass-a"
    });
    expect(login.status).toBe(200);
    const token = login.body.accessToken;

    const twoFaRes = await request(app)
      .post("/api/user/generate-2fa")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "userb@example.com" });
    expect(twoFaRes.status).toBe(403);
    expect(twoFaRes.body.error).toBe("Forbidden");

    const keyGenRes = await request(app)
      .post("/api/user/generate-keypair")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "userb@example.com" });
    expect(keyGenRes.status).toBe(403);
    expect(keyGenRes.body.error).toBe("Forbidden");
  });
});

const express = require("express");
const request = require("supertest");

describe("User lockout behavior", () => {
  let app;
  let dbMock;
  let userDoc;

  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = "test-secret";
    process.env.NODE_ENV = "test";
    process.env.USER_LOGIN_MAX_ATTEMPTS = "5";
    process.env.USER_LOGIN_LOCK_MS = String(15 * 60 * 1000);

    userDoc = {
      _id: "u-lock-1",
      email: "user@example.com",
      password: "correct-pass",
      totpSecret: null,
      isFirstLogin: false,
      lastLogin: null,
      loginAttempts: 0,
      lockedUntil: null,
      save: jest.fn().mockResolvedValue(undefined)
    };

    dbMock = {
      User: {
        findOne: jest.fn(async ({ email }) => (email === userDoc.email ? userDoc : null)),
        findById: jest.fn(async () => userDoc)
      },
      Admin: { find: jest.fn().mockResolvedValue([]) },
      Request: {
        findOne: jest.fn(),
        find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
      },
      EncryptedFile: {},
      AuditLog: { create: jest.fn().mockResolvedValue(undefined) },
      Notification: { create: jest.fn().mockResolvedValue(undefined), find: jest.fn(), findOneAndUpdate: jest.fn(), updateMany: jest.fn() },
      RefreshToken: { create: jest.fn().mockResolvedValue(undefined), findOne: jest.fn(), updateOne: jest.fn(), updateMany: jest.fn() },
      RevokedAccessToken: { findOne: jest.fn().mockResolvedValue(null), updateOne: jest.fn().mockResolvedValue(undefined) },
      getGridFSBucket: jest.fn()
    };

    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);

    const userRouter = require("../routes/user");
    app = express();
    app.use(express.json());
    app.use("/api/user", userRouter);
  });

  test("locks account after repeated failed password attempts", async () => {
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const failed = await request(app).post("/api/user/login").send({
        email: "user@example.com",
        password: "wrong-pass"
      });
      expect(failed.status).toBe(401);
    }

    expect(userDoc.loginAttempts).toBeGreaterThanOrEqual(5);
    expect(userDoc.lockedUntil instanceof Date).toBe(true);

    const blocked = await request(app).post("/api/user/login").send({
      email: "user@example.com",
      password: "correct-pass"
    });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toContain("Too many failed login attempts");
  });
});


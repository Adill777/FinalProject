const express = require("express");
const request = require("supertest");

describe("Validation and normalization contracts", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = "test-secret";
    process.env.NODE_ENV = "test";
  });

  test("signup rejects invalid email with 400", async () => {
    const userCreate = jest.fn();
    const dbMock = {
      User: { findOne: jest.fn().mockResolvedValue(null), create: userCreate },
      Admin: { find: jest.fn().mockResolvedValue([]) },
      Request: { findOne: jest.fn() },
      EncryptedFile: {},
      AuditLog: { create: jest.fn() },
      Notification: { create: jest.fn() },
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

    const res = await request(app).post("/api/user").send({
      firstname: "Test",
      email: "not-an-email",
      password: "ValidPassword1!"
    });
    expect(res.status).toBe(400);
    expect(userCreate).not.toHaveBeenCalled();
  });

  test("normalizes email/whitespace on signup", async () => {
    const create = jest.fn().mockResolvedValue({
      id: "u1",
      _id: "u1",
      email: "user@example.com"
    });
    const dbMock = {
      User: { findOne: jest.fn().mockResolvedValue(null), create },
      Admin: { find: jest.fn().mockResolvedValue([]) },
      Request: { findOne: jest.fn() },
      EncryptedFile: {},
      AuditLog: { create: jest.fn() },
      Notification: { create: jest.fn() },
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

    const res = await request(app).post("/api/user").send({
      firstname: "   Alice   Smith   ",
      lastname: "  Example   User ",
      email: "  USER@Example.COM ",
      password: "ValidPassword1!"
    });
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        firstname: "Alice Smith",
        lastname: "Example User",
        email: "user@example.com"
      })
    );
  });

  test("invalid ObjectId and invalid description return 400 on request-access", async () => {
    const userDoc = {
      _id: "u1",
      email: "user@example.com",
      password: "user-pass",
      totpSecret: null,
      isFirstLogin: false,
      lastLogin: null,
      save: jest.fn().mockResolvedValue(undefined)
    };
    const dbMock = {
      User: {
        findOne: jest.fn().mockResolvedValue(userDoc)
      },
      Admin: { find: jest.fn().mockResolvedValue([]) },
      Request: {
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
      },
      EncryptedFile: {},
      AuditLog: { create: jest.fn() },
      Notification: { create: jest.fn() },
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

    const login = await request(app).post("/api/user/login").send({
      email: "user@example.com",
      password: "user-pass"
    });
    expect(login.status).toBe(200);
    const token = login.body.accessToken;

    const badId = await request(app)
      .post("/api/user/request-access")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fileId: "not-an-object-id",
        description: "request"
      });
    expect(badId.status).toBe(400);

    const badDescription = await request(app)
      .post("/api/user/request-access")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fileId: "507f191e810c19729de860ea",
        description: "a".repeat(1001)
      });
    expect(badDescription.status).toBe(400);
  });

  test("invalid reason returns 400 on admin suspend endpoint", async () => {
    const dbMock = {
      Admin: {
        findOne: jest.fn().mockResolvedValue({
          _id: "a1",
          email: "admin@example.com",
          password: "admin-pass"
        })
      },
      User: {
        find: jest.fn(() => ({
          sort: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([])
        })),
        findById: jest.fn()
      },
      Request: { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }), updateMany: jest.fn() },
      EncryptedFile: {},
      AuditLog: { create: jest.fn() },
      Notification: { create: jest.fn(), find: jest.fn(), findOneAndUpdate: jest.fn(), updateMany: jest.fn() },
      RefreshToken: { create: jest.fn(), findOne: jest.fn(), updateOne: jest.fn(), updateMany: jest.fn() },
      RevokedAccessToken: { findOne: jest.fn().mockResolvedValue(null), updateOne: jest.fn() },
      getGridFSBucket: jest.fn()
    };
    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);

    const adminRouter = require("../routes/admin");
    const app = express();
    app.use(express.json());
    app.use("/api/admin", adminRouter);

    const login = await request(app).post("/api/admin/login").send({
      email: "admin@example.com",
      password: "admin-pass"
    });
    expect(login.status).toBe(200);
    const token = login.body.accessToken;

    const res = await request(app)
      .post("/api/admin/users/507f191e810c19729de860ea/suspend")
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "x" });
    expect(res.status).toBe(400);
  });
});

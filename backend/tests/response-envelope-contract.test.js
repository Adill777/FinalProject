const express = require("express");
const request = require("supertest");

const expectEnvelope = (body, expectedSuccess) => {
  expect(typeof body).toBe("object");
  expect(body).toHaveProperty("success", expectedSuccess);
  expect(body).toHaveProperty("data");
  expect(body).toHaveProperty("error");
  expect(body).toHaveProperty("code");
};

const createBaseDbMock = () => ({
  User: {
    findOne: jest.fn(),
    create: jest.fn(),
    findById: jest.fn()
  },
  Admin: { find: jest.fn().mockResolvedValue([]) },
  Request: {
    findOne: jest.fn(),
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
  },
  EncryptedFile: {
    findOne: jest.fn()
  },
  AuditLog: { create: jest.fn().mockResolvedValue(undefined) },
  Notification: {
    create: jest.fn().mockResolvedValue(undefined),
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 })
  },
  RefreshToken: {
    create: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 })
  },
  RevokedAccessToken: {
    findOne: jest.fn().mockResolvedValue(null),
    updateOne: jest.fn().mockResolvedValue(undefined)
  },
  getGridFSBucket: jest.fn()
});

describe("User API response envelope contract", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = "test-secret";
    process.env.NODE_ENV = "test";
  });

  test("signup returns standard success envelope", async () => {
    const dbMock = createBaseDbMock();
    dbMock.User.findOne.mockResolvedValue(null);
    dbMock.User.create.mockResolvedValue({
      _id: "u-signup-1",
      id: "u-signup-1",
      email: "envelope.signup@example.com"
    });

    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);

    const userRouter = require("../routes/user");
    const app = express();
    app.use(express.json());
    app.use("/api/user", userRouter);

    const res = await request(app).post("/api/user/").send({
      firstname: "Envelope",
      lastname: "Signup",
      email: "envelope.signup@example.com",
      password: "StrongPassw0rd!"
    });

    expect(res.status).toBe(200);
    expectEnvelope(res.body, true);
    expect(res.body.user).toMatchObject({
      id: "u-signup-1",
      email: "envelope.signup@example.com"
    });
  });

  test("login OTP challenge returns standard error envelope", async () => {
    const dbMock = createBaseDbMock();
    dbMock.User.findOne.mockResolvedValue({
      _id: "u-otp-1",
      email: "otp.required@example.com",
      password: "StrongPassw0rd!",
      totpSecret: "BASE32SECRET",
      loginAttempts: 0,
      lockedUntil: null,
      save: jest.fn().mockResolvedValue(undefined)
    });

    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);
    jest.doMock("speakeasy", () => ({
      totp: { verify: jest.fn(() => false) }
    }));

    const userRouter = require("../routes/user");
    const app = express();
    app.use(express.json());
    app.use("/api/user", userRouter);

    const res = await request(app).post("/api/user/login").send({
      email: "otp.required@example.com",
      password: "StrongPassw0rd!"
    });

    expect(res.status).toBe(401);
    expectEnvelope(res.body, false);
    expect(res.body.code).toBe("OTP_REQUIRED");
    expect(res.body.data).toMatchObject({
      otpRequired: true,
      requiresOtp: true
    });
  });

  test("request-access duplicate returns standard error envelope", async () => {
    const dbMock = createBaseDbMock();
    const RequestModel = function RequestModel(data) {
      Object.assign(this, data);
      this.save = jest.fn().mockResolvedValue(undefined);
    };
    RequestModel.findOne = jest.fn().mockResolvedValue({ status: "pending" });
    RequestModel.find = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    dbMock.Request = RequestModel;
    const userDoc = {
      _id: "u-request-1",
      email: "request.user@example.com",
      password: "StrongPassw0rd!",
      totpSecret: null,
      isFirstLogin: false,
      loginAttempts: 0,
      lockedUntil: null,
      save: jest.fn().mockResolvedValue(undefined)
    };
    dbMock.User.findOne.mockImplementation(async ({ email }) =>
      email === userDoc.email ? userDoc : null
    );

    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);

    dbMock.EncryptedFile.findOne = jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(null)
    }));

    const userRouter = require("../routes/user");
    const app = express();
    app.use(express.json());
    app.use("/api/user", userRouter);

    const login = await request(app).post("/api/user/login").send({
      email: userDoc.email,
      password: userDoc.password
    });
    expect(login.status).toBe(200);

    const res = await request(app)
      .post("/api/user/request-access")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({
        fileId: "507f191e810c19729de860ea",
        description: "Need access"
      });

    expect(res.status).toBe(409);
    expectEnvelope(res.body, false);
    expect(res.body.code).toBe("REQUEST_DUPLICATE");
  });

  test("decrypt without approval returns standard error envelope", async () => {
    const dbMock = createBaseDbMock();
    const userDoc = {
      _id: "u-decrypt-1",
      email: "decrypt.user@example.com",
      password: "StrongPassw0rd!",
      totpSecret: "BASE32SECRET",
      isFirstLogin: false,
      loginAttempts: 0,
      lockedUntil: null,
      save: jest.fn().mockResolvedValue(undefined)
    };
    dbMock.User.findOne.mockImplementation(async ({ email }) =>
      email === userDoc.email ? userDoc : null
    );
    dbMock.Request.findOne.mockResolvedValue(null);

    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);
    jest.doMock("speakeasy", () => ({
      totp: { verify: jest.fn(() => true) }
    }));

    const userRouter = require("../routes/user");
    const app = express();
    app.use(express.json());
    app.use("/api/user", userRouter);

    const login = await request(app).post("/api/user/login").send({
      email: userDoc.email,
      password: userDoc.password,
      otp: "123456"
    });
    expect(login.status).toBe(200);

    const res = await request(app)
      .post("/api/user/decrypt")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({
        fileId: "507f191e810c19729de860ea",
        secretKeyBase64: Buffer.from("private-key").toString("base64"),
        token: "123456"
      });

    expect(res.status).toBe(403);
    expectEnvelope(res.body, false);
    expect(res.body.code).toBe("ACCESS_NOT_APPROVED");
  });
});

const express = require("express");
const request = require("supertest");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const getCookie = (setCookieHeaders, name) => {
  const matched = (setCookieHeaders || []).find((cookie) => cookie.startsWith(`${name}=`));
  return matched ? matched.split(";")[0] : "";
};

describe("Approval, decrypt guard, and schema/query consistency", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = "test-secret";
    process.env.NODE_ENV = "test";
  });

  test("admin approval endpoint marks pending request approved and sets expiry", async () => {
    const requestDoc = {
      _id: "req1",
      status: "pending",
      expiresAt: null,
      email: "user@example.com",
      save: jest.fn().mockResolvedValue(undefined),
    };

    const dbMock = {
      Admin: {
        findOne: jest.fn(async () => ({
          _id: "admin1",
          email: "admin@example.com",
          password: "admin-pass",
        })),
      },
      User: {
        find: jest.fn(() => ({
          sort: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([]),
        })),
      },
      Request: {
        find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
        updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        findById: jest.fn(async () => requestDoc),
      },
      EncryptedFile: {},
      AuditLog: { create: jest.fn().mockResolvedValue(undefined) },
      Notification: { create: jest.fn() },
      RefreshToken: {
        create: jest.fn(),
        findOne: jest.fn(),
        updateOne: jest.fn(),
        updateMany: jest.fn(),
      },
      RevokedAccessToken: {
        findOne: jest.fn().mockResolvedValue(null),
        updateOne: jest.fn(),
      },
      getGridFSBucket: jest.fn(),
    };

    jest.spyOn(global, "setTimeout").mockImplementation(() => 0);
    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);

    const adminRouter = require("../routes/admin");
    const app = express();
    app.use(express.json());
    app.use("/api/admin", adminRouter);

    const login = await request(app).post("/api/admin/login").send({
      email: "admin@example.com",
      password: "admin-pass",
    });

    const res = await request(app)
      .post("/api/admin/approve-access")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ requestId: "req1" });

    expect(res.status).toBe(200);
    expect(requestDoc.status).toBe("approved");
    expect(requestDoc.expiresAt instanceof Date).toBe(true);
    expect(requestDoc.save).toHaveBeenCalled();
    expect(res.body.requestId).toBe("req1");
  });

  test("decrypt endpoint denies when access is not approved", async () => {
    const userDoc = {
      _id: "u1",
      email: "user@example.com",
      password: "user-pass",
      totpSecret: "BASE32SECRET",
      isFirstLogin: false,
      lastLogin: null,
      save: jest.fn().mockResolvedValue(undefined)
    };
    const dbMock = {
      User: {
        findOne: jest.fn().mockImplementation(async ({ email }) => {
          if (email === "user@example.com") return userDoc;
          return null;
        }),
      },
      AuditLog: { create: jest.fn() },
      Request: {
        findOne: jest.fn().mockResolvedValue(null),
      },
      EncryptedFile: {
        findOne: jest.fn(),
      },
      Admin: { find: jest.fn().mockResolvedValue([]) },
      Notification: { create: jest.fn(), find: jest.fn(), findOneAndUpdate: jest.fn(), updateMany: jest.fn() },
      RefreshToken: {
        create: jest.fn(),
        findOne: jest.fn(),
        updateOne: jest.fn(),
        updateMany: jest.fn(),
      },
      RevokedAccessToken: {
        findOne: jest.fn().mockResolvedValue(null),
        updateOne: jest.fn(),
      },
      getGridFSBucket: jest.fn(),
    };

    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);
    jest.doMock("speakeasy", () => ({
      totp: { verify: jest.fn(() => true) },
      generateSecret: jest.fn(),
    }));

    const userRouter = require("../routes/user");
    const app = express();
    app.use(express.json());
    app.use("/api/user", userRouter);

    const login = await request(app).post("/api/user/login").send({
      email: "user@example.com",
      password: "user-pass",
      otp: "123456"
    });
    expect(login.status).toBe(200);

    const res = await request(app)
      .post("/api/user/decrypt")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({
      email: "user@example.com",
      fileId: "507f191e810c19729de860ea",
      secretKeyBase64: Buffer.from("private-key").toString("base64"),
      token: "123456",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Access not approved.");
  });

  test("request-access uses JWT email identity with `email` field duplicate check", async () => {
    const findOne = jest.fn().mockResolvedValue({ status: "pending" });

    const dbMock = {
      User: {
        findOne: jest.fn().mockResolvedValue({
          _id: "u2",
          email: "user@example.com",
          password: "user-pass",
          totpSecret: null,
          isFirstLogin: false,
          lastLogin: null,
          save: jest.fn().mockResolvedValue(undefined)
        })
      },
      AuditLog: { create: jest.fn() },
      Request: {
        findOne,
      },
      EncryptedFile: {},
      Admin: { find: jest.fn().mockResolvedValue([]) },
      Notification: { create: jest.fn(), find: jest.fn(), findOneAndUpdate: jest.fn(), updateMany: jest.fn() },
      RefreshToken: {
        create: jest.fn(),
        findOne: jest.fn(),
        updateOne: jest.fn(),
        updateMany: jest.fn(),
      },
      RevokedAccessToken: {
        findOne: jest.fn().mockResolvedValue(null),
        updateOne: jest.fn(),
      },
      getGridFSBucket: jest.fn(),
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

    const payload = { email: "user@example.com", fileId: "507f191e810c19729de860ea" };
    mongoose.connection.db = {
      collection: jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue({
          _id: payload.fileId,
          metadata: {}
        })
      }))
    };
    const res = await request(app)
      .post("/api/user/request-access")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send(payload);

    expect(res.status).toBe(409);
    expect(findOne).toHaveBeenCalledWith({
      email: payload.email,
      fileId: expect.anything(),
    });
  });

  test("authorization regression: file endpoints deny cross-user access attempts", async () => {
    const dbMock = {
      User: {
        findOne: jest.fn(async ({ email }) => {
          if (email === "usera@example.com") {
            return {
              _id: "ua1",
              email,
              password: "pass-a",
              totpSecret: "BASE32SECRET",
              isFirstLogin: false,
              lastLogin: null,
              save: jest.fn().mockResolvedValue(undefined)
            };
          }
          if (email === "userb@example.com") {
            return {
              _id: "ub1",
              email,
              password: "pass-b",
              totpSecret: "BASE32SECRET",
              isFirstLogin: false,
              lastLogin: null,
              save: jest.fn().mockResolvedValue(undefined)
            };
          }
          return null;
        })
      },
      AuditLog: { create: jest.fn() },
      Request: {
        findOne: jest.fn(),
        find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      },
      EncryptedFile: {
        findOne: jest.fn()
      },
      Admin: { find: jest.fn().mockResolvedValue([]) },
      Notification: { create: jest.fn(), find: jest.fn(), findOneAndUpdate: jest.fn(), updateMany: jest.fn() },
      RefreshToken: {
        create: jest.fn(),
        findOne: jest.fn(),
        updateOne: jest.fn(),
        updateMany: jest.fn(),
      },
      RevokedAccessToken: {
        findOne: jest.fn().mockResolvedValue(null),
        updateOne: jest.fn(),
      },
      getGridFSBucket: jest.fn(),
    };

    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);
    jest.doMock("speakeasy", () => ({
      totp: { verify: jest.fn(() => true) },
      generateSecret: jest.fn(),
    }));

    const userRouter = require("../routes/user");
    const app = express();
    app.use(express.json());
    app.use("/api/user", userRouter);

    const loginA = await request(app).post("/api/user/login").send({
      email: "usera@example.com",
      password: "pass-a",
      otp: "123456"
    });
    expect(loginA.status).toBe(200);
    const tokenA = loginA.body.accessToken;

    const fileListOther = await request(app)
      .get("/api/user/filelist/userb@example.com")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(fileListOther.status).toBe(403);
    expect(fileListOther.body.error).toBe("Forbidden");

    const requestAccessOther = await request(app)
      .post("/api/user/request-access")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        email: "userb@example.com",
        fileId: "507f191e810c19729de860ea"
      });
    expect(requestAccessOther.status).toBe(403);
    expect(requestAccessOther.body.error).toBe("Forbidden");

    const decryptOther = await request(app)
      .post("/api/user/decrypt")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        email: "userb@example.com",
        fileId: "507f191e810c19729de860ea",
        secretKeyBase64: Buffer.from("private-key").toString("base64"),
        token: "123456"
      });
    expect(decryptOther.status).toBe(403);
    expect(decryptOther.body.error).toBe("Forbidden");
  });

  test("file endpoints enforce invalid/revoked access token denial", async () => {
    const dbMock = {
      User: {
        findOne: jest.fn().mockResolvedValue({
          _id: "u3",
          email: "user@example.com",
          password: "user-pass",
          totpSecret: null,
          isFirstLogin: false,
          lastLogin: null,
          save: jest.fn().mockResolvedValue(undefined)
        })
      },
      AuditLog: { create: jest.fn() },
      Request: {
        find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      },
      EncryptedFile: {},
      Admin: { find: jest.fn().mockResolvedValue([]) },
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
        updateMany: jest.fn(),
      },
      RevokedAccessToken: {
        findOne: jest.fn().mockResolvedValue({ _id: "rev1" }),
        updateOne: jest.fn(),
      },
      getGridFSBucket: jest.fn(),
    };

    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);

    const userRouter = require("../routes/user");
    const app = express();
    app.use(express.json());
    app.use("/api/user", userRouter);

    const invalidTokenRes = await request(app)
      .get("/api/user/filelist/user@example.com")
      .set("Authorization", "Bearer definitely.invalid.token");
    expect(invalidTokenRes.status).toBe(401);
    expect(invalidTokenRes.body.error).toBe("Invalid or expired token");

    const login = await request(app).post("/api/user/login").send({
      email: "user@example.com",
      password: "user-pass"
    });
    expect(login.status).toBe(200);

    const revokedTokenRes = await request(app)
      .get("/api/user/notifications")
      .set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(revokedTokenRes.status).toBe(401);
    expect(revokedTokenRes.body.error).toBe("Token revoked");
  });

  test("source consistency: schema and routes do not reference userEmail", () => {
    const dbSource = fs.readFileSync(path.join(__dirname, "..", "models", "db.js"), "utf8");
    const userRouteSource = fs.readFileSync(path.join(__dirname, "..", "routes", "user.js"), "utf8");

    expect(dbSource).toContain("email: { type: String, required: true }");
    expect(userRouteSource).not.toContain("userEmail");
  });

  test("user notification routes require JWT and use authenticated identity", async () => {
    const findOneAndUpdate = jest.fn().mockResolvedValue({
      _id: "n1",
      recipientType: "user",
      recipientEmail: "user@example.com",
      readAt: new Date()
    });
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    const dbMock = {
      User: {
        findOne: jest.fn().mockResolvedValue({
          _id: "u1",
          email: "user@example.com",
          password: "user-pass",
          totpSecret: null,
          isFirstLogin: false,
          lastLogin: null,
          save: jest.fn().mockResolvedValue(undefined)
        })
      },
      AuditLog: { create: jest.fn() },
      Request: { findOne: jest.fn() },
      EncryptedFile: {},
      Admin: { find: jest.fn().mockResolvedValue([]) },
      Notification: {
        create: jest.fn(),
        find: jest.fn(() => ({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([
            {
              _id: "n1",
              recipientType: "user",
              recipientEmail: "user@example.com",
              title: "Access Request Approved",
              message: "Approved",
              readAt: null,
              createdAt: new Date().toISOString()
            }
          ])
        })),
        findOneAndUpdate,
        updateMany
      },
      RefreshToken: {
        create: jest.fn(),
        findOne: jest.fn(),
        updateOne: jest.fn(),
        updateMany: jest.fn()
      },
      RevokedAccessToken: {
        findOne: jest.fn().mockResolvedValue(null),
        updateOne: jest.fn()
      },
      getGridFSBucket: jest.fn()
    };

    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);

    const userRouter = require("../routes/user");
    const app = express();
    app.use(express.json());
    app.use("/api/user", userRouter);

    const unauthorized = await request(app).get("/api/user/notifications");
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.error).toBe("Unauthorized");

    const login = await request(app).post("/api/user/login").send({
      email: "user@example.com",
      password: "user-pass"
    });
    expect(login.status).toBe(200);
    expect(typeof login.body.accessToken).toBe("string");

    const token = login.body.accessToken;
    const listRes = await request(app)
      .get("/api/user/notifications")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.notifications)).toBe(true);

    const markOne = await request(app)
      .patch("/api/user/notifications/n1/read")
      .set("Authorization", `Bearer ${token}`);
    expect(markOne.status).toBe(200);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: "n1",
        recipientType: "user",
        recipientEmail: "user@example.com"
      },
      { $set: { readAt: expect.any(Date) } },
      { new: true }
    );

    const markAll = await request(app)
      .post("/api/user/notifications/read-all")
      .set("Authorization", `Bearer ${token}`);
    expect(markAll.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith(
      {
        recipientType: "user",
        recipientEmail: "user@example.com",
        readAt: null
      },
      { $set: { readAt: expect.any(Date) } }
    );
  });

  test("authorization regression: user cannot access or modify another user's notifications", async () => {
    const findMock = jest.fn(() => ({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([])
    }));
    const findOneAndUpdate = jest
      .fn()
      // first call: user A trying to read notification that belongs to user B
      .mockResolvedValueOnce(null)
      // second call: user B reads own notification
      .mockResolvedValueOnce({
        _id: "n-owned-by-b",
        recipientType: "user",
        recipientEmail: "userb@example.com",
        readAt: new Date()
      });

    const dbMock = {
      User: {
        findOne: jest.fn(async ({ email }) => {
          if (email === "usera@example.com") {
            return {
              _id: "ua1",
              email,
              password: "pass-a",
              totpSecret: null,
              isFirstLogin: false,
              lastLogin: null,
              save: jest.fn().mockResolvedValue(undefined)
            };
          }
          if (email === "userb@example.com") {
            return {
              _id: "ub1",
              email,
              password: "pass-b",
              totpSecret: null,
              isFirstLogin: false,
              lastLogin: null,
              save: jest.fn().mockResolvedValue(undefined)
            };
          }
          return null;
        })
      },
      AuditLog: { create: jest.fn() },
      Request: { findOne: jest.fn() },
      EncryptedFile: {},
      Admin: { find: jest.fn().mockResolvedValue([]) },
      Notification: {
        create: jest.fn(),
        find: findMock,
        findOneAndUpdate,
        updateMany: jest.fn()
      },
      RefreshToken: {
        create: jest.fn(),
        findOne: jest.fn(),
        updateOne: jest.fn(),
        updateMany: jest.fn()
      },
      RevokedAccessToken: {
        findOne: jest.fn().mockResolvedValue(null),
        updateOne: jest.fn()
      },
      getGridFSBucket: jest.fn()
    };

    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);

    const userRouter = require("../routes/user");
    const app = express();
    app.use(express.json());
    app.use("/api/user", userRouter);

    const loginA = await request(app).post("/api/user/login").send({
      email: "usera@example.com",
      password: "pass-a"
    });
    const loginB = await request(app).post("/api/user/login").send({
      email: "userb@example.com",
      password: "pass-b"
    });

    expect(loginA.status).toBe(200);
    expect(loginB.status).toBe(200);

    const tokenA = loginA.body.accessToken;
    const tokenB = loginB.body.accessToken;

    // list must be scoped to token identity (user A)
    const listA = await request(app)
      .get("/api/user/notifications")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(listA.status).toBe(200);
    expect(findMock).toHaveBeenCalledWith({
      recipientType: "user",
      recipientEmail: "usera@example.com"
    });

    // user A cannot mark user B's notification as read
    const markOther = await request(app)
      .patch("/api/user/notifications/n-owned-by-b/read")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(markOther.status).toBe(404);
    expect(markOther.body.error).toBe("Notification not found");
    expect(findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      {
        _id: "n-owned-by-b",
        recipientType: "user",
        recipientEmail: "usera@example.com"
      },
      { $set: { readAt: expect.any(Date) } },
      { new: true }
    );

    // user B can mark own notification as read
    const markOwn = await request(app)
      .patch("/api/user/notifications/n-owned-by-b/read")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(markOwn.status).toBe(200);
    expect(findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      {
        _id: "n-owned-by-b",
        recipientType: "user",
        recipientEmail: "userb@example.com"
      },
      { $set: { readAt: expect.any(Date) } },
      { new: true }
    );
  });

  test("user refresh-token rotates and rejects reused refresh token", async () => {
    const userA = {
      _id: "u-refresh-1",
      email: "refresh@example.com",
      password: "refresh-pass",
      totpSecret: null,
      isFirstLogin: false,
      lastLogin: null,
      status: "active",
      save: jest.fn().mockResolvedValue(undefined)
    };

    const currentStored = {
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      familyId: "user-family-1",
      replacedByTokenHash: null,
      save: jest.fn().mockResolvedValue(undefined)
    };
    const reusedStored = {
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      familyId: "user-family-1",
      replacedByTokenHash: "next-user-hash",
      save: jest.fn()
    };

    const dbMock = {
      User: {
        findOne: jest.fn().mockResolvedValue(userA),
        findById: jest.fn().mockResolvedValue(userA)
      },
      AuditLog: { create: jest.fn() },
      Request: { findOne: jest.fn() },
      EncryptedFile: {},
      Admin: { find: jest.fn().mockResolvedValue([]) },
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
        create: jest.fn().mockResolvedValue(undefined),
        findOne: jest.fn()
          .mockResolvedValueOnce(currentStored)
          .mockResolvedValueOnce(reusedStored),
        updateOne: jest.fn(),
        updateMany: jest.fn()
      },
      RevokedAccessToken: {
        findOne: jest.fn().mockResolvedValue(null),
        updateOne: jest.fn()
      },
      getGridFSBucket: jest.fn()
    };

    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);

    const userRouter = require("../routes/user");
    const app = express();
    app.use(express.json());
    app.use("/api/user", userRouter);

    const login = await request(app).post("/api/user/login").send({
      email: "refresh@example.com",
      password: "refresh-pass"
    });
    expect(login.status).toBe(200);
    const refreshCookie = getCookie(login.headers["set-cookie"], "user_refresh_token");
    const csrfCookie = getCookie(login.headers["set-cookie"], "user_csrf_token");
    const refreshPayload = jwt.decode(refreshCookie.split("=")[1]);
    currentStored.familyId = refreshPayload.familyId;
    reusedStored.familyId = refreshPayload.familyId;
    const csrfToken = csrfCookie.split("=")[1];

    const firstRotate = await request(app)
      .post("/api/user/refresh-token")
      .set("Cookie", [refreshCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({});
    expect(firstRotate.status).toBe(200);
    expect(typeof firstRotate.body.accessToken).toBe("string");
    expect(currentStored.save).toHaveBeenCalled();

    const reused = await request(app)
      .post("/api/user/refresh-token")
      .set("Cookie", [refreshCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({});
    expect(reused.status).toBe(401);
    expect(reused.body.error).toBe("Refresh token is no longer valid");
    expect(dbMock.RefreshToken.updateMany).toHaveBeenCalledWith(
      { familyId: refreshPayload.familyId, subjectType: "user", revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } }
    );
  });
});

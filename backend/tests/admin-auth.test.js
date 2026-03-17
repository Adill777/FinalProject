const express = require("express");
const request = require("supertest");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const getCookie = (setCookieHeaders, name) => {
  const matched = (setCookieHeaders || []).find((cookie) => cookie.startsWith(`${name}=`));
  return matched ? matched.split(";")[0] : "";
};

describe("Admin auth flow", () => {
  let app;
  let dbMock;
  let usersFindExec;

  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = "test-secret";
    process.env.NODE_ENV = "test";

    usersFindExec = jest.fn().mockResolvedValue([
      { _id: "u1", email: "alice@example.com", status: "active" },
    ]);

    dbMock = {
      Admin: {
        findOne: jest.fn(async ({ email }) => {
          if (email !== "admin@example.com") return null;
          return {
            _id: "a1",
            email: "admin@example.com",
            password: "admin-pass",
          };
        }),
        findById: jest.fn(async (id) => ({
          _id: id,
          email: "admin@example.com",
          password: "admin-pass",
        })),
      },
      User: {
        find: jest.fn(() => ({
          sort: jest.fn().mockReturnThis(),
          exec: usersFindExec,
        })),
      },
      Request: {},
      EncryptedFile: {},
      AuditLog: { create: jest.fn() },
      Notification: {
        find: jest.fn(() => ({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })),
        findOneAndUpdate: jest.fn().mockResolvedValue({
          _id: "n1",
          recipientType: "admin",
          recipientEmail: "admin@example.com",
          readAt: new Date(),
        }),
        updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
      },
      RefreshToken: {
        create: jest.fn().mockResolvedValue(undefined),
        findOne: jest.fn(),
        updateOne: jest.fn(),
        updateMany: jest.fn(),
      },
      RevokedAccessToken: {
        findOne: jest.fn().mockResolvedValue(null),
        updateOne: jest.fn().mockResolvedValue(undefined),
      },
      getGridFSBucket: jest.fn(),
    };

    jest.doMock("../models/db.js", () => dbMock);
    jest.doMock("../models/db", () => dbMock);

    const adminRouter = require("../routes/admin");
    app = express();
    app.use(express.json());
    app.use("/api/admin", adminRouter);
  });

  test("login returns JWT token for valid admin credentials", async () => {
    const res = await request(app).post("/api/admin/login").send({
      email: "admin@example.com",
      password: "admin-pass",
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.accessToken.length).toBeGreaterThan(10);
    expect(res.body.admin.email).toBe("admin@example.com");
    expect(getCookie(res.headers["set-cookie"], "admin_refresh_token")).toContain("admin_refresh_token=");
    expect(getCookie(res.headers["set-cookie"], "admin_csrf_token")).toContain("admin_csrf_token=");
  });

  test("protected admin route rejects missing token and accepts valid bearer token", async () => {
    const unauthorized = await request(app).get("/api/admin/users");
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.error).toBe("Unauthorized");

    const login = await request(app).post("/api/admin/login").send({
      email: "admin@example.com",
      password: "admin-pass",
    });
    const token = login.body.token;

    const authorized = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${token}`);

    expect(authorized.status).toBe(200);
    expect(Array.isArray(authorized.body.users)).toBe(true);
    expect(authorized.body.users[0].email).toBe("alice@example.com");
  });

  test("refresh-token rotates refresh token and returns a new access token", async () => {
    const login = await request(app).post("/api/admin/login").send({
      email: "admin@example.com",
      password: "admin-pass",
    });

    const stored = {
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      familyId: "family-1",
      replacedByTokenHash: null,
      save: jest.fn().mockResolvedValue(undefined),
    };
    dbMock.RefreshToken.findOne.mockResolvedValueOnce(stored);

    const refreshCookie = getCookie(login.headers["set-cookie"], "admin_refresh_token");
    const csrfCookie = getCookie(login.headers["set-cookie"], "admin_csrf_token");
    const refreshPayload = jwt.decode(refreshCookie.split("=")[1]);
    const csrfToken = csrfCookie.split("=")[1];
    stored.familyId = refreshPayload.familyId;
    const refreshRes = await request(app)
      .post("/api/admin/refresh-token")
      .set("Cookie", [refreshCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({});

    expect(refreshRes.status).toBe(200);
    expect(typeof refreshRes.body.accessToken).toBe("string");
    expect(stored.save).toHaveBeenCalled();
    expect(getCookie(refreshRes.headers["set-cookie"], "admin_refresh_token")).toContain("admin_refresh_token=");
  });

  test("refresh-token reuse is rejected and revokes token family", async () => {
    const login = await request(app).post("/api/admin/login").send({
      email: "admin@example.com",
      password: "admin-pass",
    });

    const rotated = {
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      familyId: "family-reuse",
      replacedByTokenHash: null,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const reused = {
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      familyId: "family-reuse",
      replacedByTokenHash: "next-token-hash",
      save: jest.fn(),
    };

    dbMock.RefreshToken.findOne
      .mockResolvedValueOnce(rotated)
      .mockResolvedValueOnce(reused);

    const refreshCookie = getCookie(login.headers["set-cookie"], "admin_refresh_token");
    const csrfCookie = getCookie(login.headers["set-cookie"], "admin_csrf_token");
    const refreshPayload = jwt.decode(refreshCookie.split("=")[1]);
    rotated.familyId = refreshPayload.familyId;
    reused.familyId = refreshPayload.familyId;
    const csrfToken = csrfCookie.split("=")[1];
    const first = await request(app)
      .post("/api/admin/refresh-token")
      .set("Cookie", [refreshCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({});
    expect(first.status).toBe(200);
    expect(rotated.save).toHaveBeenCalled();

    const second = await request(app)
      .post("/api/admin/refresh-token")
      .set("Cookie", [refreshCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({});
    expect(second.status).toBe(401);
    expect(second.body.error).toBe("Refresh token is no longer valid");
    expect(dbMock.RefreshToken.updateMany).toHaveBeenCalledWith(
      { familyId: refreshPayload.familyId, revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } }
    );
  });

  test("refresh-token session metadata mismatch revokes family and rejects request", async () => {
    const login = await request(app).post("/api/admin/login").send({
      email: "admin@example.com",
      password: "admin-pass",
    });

    const refreshCookie = getCookie(login.headers["set-cookie"], "admin_refresh_token");
    const csrfCookie = getCookie(login.headers["set-cookie"], "admin_csrf_token");
    const refreshPayload = jwt.decode(refreshCookie.split("=")[1]);
    const csrfToken = csrfCookie.split("=")[1];

    dbMock.RefreshToken.findOne.mockResolvedValueOnce({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      familyId: refreshPayload.familyId,
      replacedByTokenHash: null,
      ipAddress: "198.51.100.10",
      userAgent: "Old-User-Agent",
      csrfTokenHash: crypto.createHash("sha256").update(csrfToken).digest("hex"),
      save: jest.fn().mockResolvedValue(undefined),
    });

    const res = await request(app)
      .post("/api/admin/refresh-token")
      .set("Cookie", [refreshCookie, csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Session anomaly detected. Please log in again.");
    expect(dbMock.RefreshToken.updateMany).toHaveBeenCalledWith(
      { familyId: refreshPayload.familyId, revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } }
    );
  });

  test("encrypt rejects mismatched file signature", async () => {
    dbMock.User.findOne = jest.fn().mockResolvedValue({
      _id: "u1",
      email: "alice@example.com",
      publicKey: Buffer.from("fake-public-key").toString("base64"),
    });

    const login = await request(app).post("/api/admin/login").send({
      email: "admin@example.com",
      password: "admin-pass",
    });

    const res = await request(app)
      .post("/api/admin/encrypt")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .field("email", "alice@example.com")
      .attach("file", Buffer.from("this-is-not-a-pdf"), {
        filename: "document.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("File signature validation failed.");
  });

  test("admin can delete uploaded file with cascade cleanup", async () => {
    const mongoose = require("mongoose");
    const fileId = "507f191e810c19729de860ea";
    const deleteMock = jest.fn().mockResolvedValue(undefined);

    mongoose.connection.db = {
      collection: jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue({
          _id: fileId,
          filename: "report.pdf",
          metadata: { email: "alice@example.com", mimetype: "application/pdf" }
        }),
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 })
      }))
    };

    dbMock.getGridFSBucket.mockReturnValue({
      delete: deleteMock
    });
    dbMock.Request.find = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { email: "alice@example.com" },
        { email: "alice@example.com" }
      ])
    });
    dbMock.Request.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 2 });
    dbMock.EncryptedFile.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    dbMock.Notification.create = jest.fn().mockResolvedValue(undefined);

    const login = await request(app).post("/api/admin/login").send({
      email: "admin@example.com",
      password: "admin-pass",
    });

    const res = await request(app)
      .delete(`/api/admin/files/${fileId}`)
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({ reason: "Cleanup outdated file" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: "File scheduled for deletion.",
      removedRequests: 2,
    });
    expect(deleteMock).not.toHaveBeenCalled();
    expect(dbMock.EncryptedFile.updateOne).toHaveBeenCalledWith(
      { fileId: expect.anything() },
      expect.any(Object)
    );
    expect(dbMock.Request.updateMany).toHaveBeenCalledWith(
      { fileId: expect.anything(), status: { $in: ["pending", "approved"] } },
      expect.any(Object)
    );
    expect(dbMock.AuditLog.create).toHaveBeenCalled();
  });

  test("repeated invalid auth attempts emit elevated security alert", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", "Bearer invalid-token-value");
      expect(res.status).toBe(401);
    }

    const elevatedLogged = [...warnSpy.mock.calls, ...errorSpy.mock.calls].some(([line]) =>
      typeof line === "string" && line.includes("\"type\":\"security_alert_elevated\"")
    );
    expect(elevatedLogged).toBe(true);
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("notification APIs list, mark one read, and mark all read", async () => {
    dbMock.Notification.find.mockReturnValueOnce({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          _id: "n1",
          recipientType: "admin",
          recipientEmail: "admin@example.com",
          title: "New Access Request",
          message: "A new request was submitted",
          readAt: null,
          createdAt: new Date().toISOString(),
        },
      ]),
    });

    const login = await request(app).post("/api/admin/login").send({
      email: "admin@example.com",
      password: "admin-pass",
    });
    const token = login.body.accessToken;

    const listRes = await request(app)
      .get("/api/admin/notifications?unreadOnly=true&limit=10")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.notifications)).toBe(true);
    expect(listRes.body.notifications).toHaveLength(1);

    const markOne = await request(app)
      .patch("/api/admin/notifications/n1/read")
      .set("Authorization", `Bearer ${token}`);
    expect(markOne.status).toBe(200);
    expect(dbMock.Notification.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: "n1",
        recipientType: "admin",
        recipientEmail: "admin@example.com",
      },
      { $set: { readAt: expect.any(Date) } },
      { new: true }
    );

    const markAll = await request(app)
      .post("/api/admin/notifications/read-all")
      .set("Authorization", `Bearer ${token}`);
    expect(markAll.status).toBe(200);
    expect(markAll.body.updated).toBe(2);
    expect(dbMock.Notification.updateMany).toHaveBeenCalledWith(
      {
        recipientType: "admin",
        recipientEmail: "admin@example.com",
        readAt: null,
      },
      { $set: { readAt: expect.any(Date) } }
    );
  });

  test("protected route rejects refresh token in Authorization header", async () => {
    const login = await request(app).post("/api/admin/login").send({
      email: "admin@example.com",
      password: "admin-pass",
    });

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${getCookie(login.headers["set-cookie"], "admin_refresh_token").split("=")[1] || ""}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid token type");
  });

  test("protected route rejects revoked access token", async () => {
    dbMock.RevokedAccessToken.findOne.mockResolvedValueOnce({
      jti: "revoked-jti",
      subjectType: "admin",
      subjectId: "a1",
    });

    const login = await request(app).post("/api/admin/login").send({
      email: "admin@example.com",
      password: "admin-pass",
    });

    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${login.body.accessToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Token revoked");
  });

  test("notification routes reject unauthorized access", async () => {
    const res = await request(app).get("/api/admin/notifications");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });
});

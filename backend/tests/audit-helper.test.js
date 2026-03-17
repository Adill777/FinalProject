const { logAudit } = require("../utils/audit");

describe("logAudit", () => {
  test("writes audit event with fallback system actor email when missing", async () => {
    const create = jest.fn().mockResolvedValue({});
    const AuditLogModel = { create };

    await logAudit({
      AuditLogModel,
      actorType: "system",
      actorEmail: "",
      action: "security_alert",
      targetType: "session",
      targetId: "abc"
    });

    expect(create).toHaveBeenCalledTimes(1);
    const payload = create.mock.calls[0][0];
    expect(payload.actorEmail).toBe("system@freqvault.local");
    expect(payload.adminEmail).toBe("system@freqvault.local");
    expect(payload.action).toBe("security_alert");
  });

  test("does not write when required fields are missing", async () => {
    const create = jest.fn().mockResolvedValue({});
    const AuditLogModel = { create };

    await logAudit({
      AuditLogModel,
      actorType: "admin",
      actorEmail: "admin@example.com",
      action: ""
    });

    expect(create).not.toHaveBeenCalled();
  });
});

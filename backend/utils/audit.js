const logAudit = async ({
  AuditLogModel,
  actorType,
  actorId = "",
  actorEmail,
  action,
  targetType = "user",
  targetId = "",
  targetEmail = "",
  reason = "",
  ipAddress = "",
  metadata = {}
}) => {
  if (!AuditLogModel || !actorType || !action) return;

  const normalizedActorType = String(actorType).trim().toLowerCase();
  const normalizedAction = String(action).trim();
  if (!normalizedAction) return;

  const normalizedActorEmail = String(actorEmail || "").trim() || (
    normalizedActorType === "system"
      ? "system@aeronox.local"
      : normalizedActorType === "admin"
        ? "unknown-admin@aeronox.local"
        : "unknown-user@aeronox.local"
  );

  await AuditLogModel.create({
    // Legacy fields
    adminEmail: normalizedActorEmail,
    action: normalizedAction,
    targetUserEmail: targetEmail || "",
    reason: String(reason || ""),
    ipAddress: String(ipAddress || ""),

    // Normalized fields
    actorType: normalizedActorType,
    actorId,
    actorEmail: normalizedActorEmail,
    targetType,
    targetId,
    targetEmail,
    metadata
  });
};

module.exports = {
  logAudit
};

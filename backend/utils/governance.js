const mongoose = require("mongoose");
const { EncryptedFile, Request } = require("../models/db");
const { getGridFSBucket } = require("../models/db");
const { log } = require("./logger");

const DEFAULT_RETENTION_DAYS = Number(process.env.FILE_RETENTION_DAYS || 90);
const SOFT_DELETE_WINDOW_HOURS = Number(process.env.FILE_SOFT_DELETE_WINDOW_HOURS || 24);
const GOVERNANCE_INTERVAL_MS = Number(process.env.GOVERNANCE_INTERVAL_MS || 5 * 60 * 1000);

const computeRetentionExpiry = (date = new Date()) =>
  new Date(date.getTime() + DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

const computeSoftDeletePurgeAt = (date = new Date()) =>
  new Date(date.getTime() + SOFT_DELETE_WINDOW_HOURS * 60 * 60 * 1000);

const markFileAsSoftDeleted = async ({ fileId, reason, adminEmail }) => {
  const now = new Date();
  const purgeAt = computeSoftDeletePurgeAt(now);
  const objectId = typeof fileId === "string" ? new mongoose.Types.ObjectId(fileId) : fileId;

  await Promise.all([
    mongoose.connection.db.collection("uploads.files").updateOne(
      { _id: objectId },
      {
        $set: {
          "metadata.deletedAt": now,
          "metadata.deletedByAdminEmail": adminEmail || "",
          "metadata.deletionReason": reason || "",
          "metadata.purgeAt": purgeAt
        }
      }
    ),
    EncryptedFile.updateOne(
      { fileId: objectId },
      {
        $set: {
          isDeleted: true,
          deletedAt: now,
          purgeAt,
          deletionReason: reason || "",
          deletedByAdminEmail: adminEmail || ""
        }
      }
    ),
    Request.updateMany(
      { fileId: objectId, status: { $in: ["pending", "approved"] } },
      { $set: { status: "file_removed", statusReason: reason || "file removed by administrator" } }
    )
  ]);

  return { deletedAt: now, purgeAt };
};

const restoreSoftDeletedFile = async ({ fileId }) => {
  const objectId = typeof fileId === "string" ? new mongoose.Types.ObjectId(fileId) : fileId;
  await Promise.all([
    mongoose.connection.db.collection("uploads.files").updateOne(
      { _id: objectId },
      {
        $unset: {
          "metadata.deletedAt": "",
          "metadata.deletedByAdminEmail": "",
          "metadata.deletionReason": "",
          "metadata.purgeAt": ""
        }
      }
    ),
    EncryptedFile.updateOne(
      { fileId: objectId },
      {
        $set: {
          isDeleted: false,
          deletedAt: null,
          purgeAt: null,
          deletionReason: "",
          deletedByAdminEmail: ""
        }
      }
    )
  ]);
};

const purgeSoftDeletedFiles = async () => {
  const now = new Date();
  const filesCollection = mongoose.connection.db.collection("uploads.files");
  const candidates = await filesCollection.find(
    { "metadata.purgeAt": { $lte: now } },
    { projection: { _id: 1 } }
  ).toArray();

  if (candidates.length === 0) return 0;
  const bucket = getGridFSBucket();
  let deletedCount = 0;
  for (const item of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await bucket.delete(item._id);
      // eslint-disable-next-line no-await-in-loop
      await EncryptedFile.deleteOne({ fileId: item._id });
      deletedCount += 1;
    } catch (_err) {
      // skip missing files and continue
    }
  }
  return deletedCount;
};

const softDeleteExpiredRetainedFiles = async () => {
  const now = new Date();
  const filesCollection = mongoose.connection.db.collection("uploads.files");
  const expired = await filesCollection.find(
    {
      "metadata.expiresAt": { $lte: now },
      "metadata.deletedAt": { $exists: false }
    },
    { projection: { _id: 1 } }
  ).toArray();

  for (const file of expired) {
    // eslint-disable-next-line no-await-in-loop
    await markFileAsSoftDeleted({
      fileId: file._id,
      reason: "file retention period elapsed",
      adminEmail: "system"
    });
  }

  return expired.length;
};

const startGovernanceJobs = () => {
  const run = async () => {
    try {
      if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
        return;
      }
      const [expiredSoftDeleted, purged] = await Promise.all([
        softDeleteExpiredRetainedFiles(),
        purgeSoftDeletedFiles()
      ]);
      if (expiredSoftDeleted > 0 || purged > 0) {
        log("info", "governance_cleanup", { expiredSoftDeleted, purged });
      }
    } catch (error) {
      log("error", "governance_cleanup_error", { message: error?.message || "governance cleanup failed" });
    }
  };

  setInterval(() => {
    void run();
  }, GOVERNANCE_INTERVAL_MS);
  void run();
};

module.exports = {
  computeRetentionExpiry,
  computeSoftDeletePurgeAt,
  markFileAsSoftDeleted,
  restoreSoftDeletedFile,
  startGovernanceJobs
};

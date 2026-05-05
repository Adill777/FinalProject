const mongoose = require("mongoose");
const { GridFSBucket } = require("mongodb");
const { log } = require("../utils/logger");

const isProduction = process.env.NODE_ENV === "production";
const mongoUri = String(process.env.MONGODB_URI || "").trim();

if (isProduction && !mongoUri) {
  throw new Error("MONGODB_URI is required in production.");
}

if (isProduction && !mongoUri.includes("@")) {
  throw new Error("MONGODB_URI must include authentication credentials in production.");
}

const defaultDevUri = "mongodb://localhost:27017/aeronox20";
const effectiveMongoUri = mongoUri || defaultDevUri;

const mongoOptions = {
  autoIndex: !isProduction,
  serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
  tls: isProduction
};

mongoose.connect(effectiveMongoUri, mongoOptions)
  .then(() => {
    log("info", "db_connected", { message: "connected to mongoDB" });
  })
  .catch((error) => {
    log("error", "db_connection_error", { message: error?.message || "unknown database connection error" });
    throw error;
  });

let gridfsBucket;

mongoose.connection.once("open", () => {
  gridfsBucket = new GridFSBucket(mongoose.connection.db, {
    bucketName: "uploads",
  });
  log("info", "gridfs_initialized", { message: "GridFSBucket initialized" });
});

function getGridFSBucket() {
  if (!gridfsBucket) {
    throw new Error("GridFSBucket not initialized yet!");
  }
  return gridfsBucket;
}

const userSchema = new mongoose.Schema({
  firstname: { type: String, required: true },
  lastname: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, minlength: 8 },
  passwordResetTokenHash: { type: String, default: null },
  passwordResetExpiresAt: { type: Date, default: null },
  passwordResetRequestedAt: { type: Date, default: null },
  publicKey: { type: String, default: null },
  totpSecret: { type: String, default: null },
  isFirstLogin: { type: Boolean, default: true },
  status: { type: String, enum: ["active", "suspended", "deleted"], default: "active" },
  deletedAt: { type: Date, default: null },
  lastLogin: { type: Date, default: null },
  loginAttempts: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null }
}, { timestamps: true });

const adminSchema = new mongoose.Schema({
  firstname: { type: String, required: true },
  lastname: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, minlength: 8 }
}, { timestamps: true });

const accessRequest = new mongoose.Schema({
  email: { type: String, required: true },
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  description: { type: String, default: "" },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "denied", "expired", "used", "file_removed"],
    default: "pending"
  },
  requestedAt: { type: Date, default: Date.now },
  expiresAt: Date,
  statusReason: { type: String, default: "" }
}, { timestamps: true });

const EncryptedFileSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  encryptedAESKey: { type: String, required: true },
  iv: { type: String, required: true },
  authTag: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  purgeAt: { type: Date, default: null },
  deletionReason: { type: String, default: "" },
  deletedByAdminEmail: { type: String, default: "" }
});

const AuditLogSchema = new mongoose.Schema({
  adminEmail: { type: String, required: true, immutable: true },
  action: { type: String, required: true, immutable: true },
  targetUserEmail: { type: String, required: true, immutable: true },
  reason: { type: String, default: "", immutable: true },
  ipAddress: { type: String, default: "", immutable: true },
  createdAt: { type: Date, default: Date.now, immutable: true },
  actorType: { type: String, enum: ["admin", "user", "system"], required: true, immutable: true },
  actorId: { type: String, default: "", immutable: true },
  actorEmail: { type: String, required: true, immutable: true },
  targetType: { type: String, enum: ["admin", "user", "request", "file", "session", "notification", "system"], default: "user", immutable: true },
  targetId: { type: String, default: "", immutable: true },
  targetEmail: { type: String, default: "", immutable: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {}, immutable: true }
}, { versionKey: false });

AuditLogSchema.pre(
  [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "findByIdAndUpdate",
    "replaceOne",
    "findOneAndReplace",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete",
    "findByIdAndDelete"
  ],
  function(next) {
    next(new Error("AuditLog entries are immutable"));
  }
);

const refreshTokenSchema = new mongoose.Schema(
  {
    subjectType: { type: String, enum: ["admin", "user"], required: true },
    subjectId: { type: String, required: true },
    subjectEmail: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    csrfTokenHash: { type: String, required: true },
    familyId: { type: String, required: true },
    revokedAt: { type: Date, default: null },
    replacedByTokenHash: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" }
  },
  { timestamps: true }
);

const revokedAccessTokenSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true },
    subjectType: { type: String, enum: ["admin", "user"], required: true },
    subjectId: { type: String, required: true },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
revokedAccessTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const notificationSchema = new mongoose.Schema(
  {
    recipientType: { type: String, enum: ["admin", "user"], required: true },
    recipientEmail: { type: String, required: true, index: true },
    eventType: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);

notificationSchema.index({ recipientEmail: 1, readAt: 1, createdAt: -1 });

const User = mongoose.model("User", userSchema);
const Admin = mongoose.model("Admin", adminSchema);
const Request = mongoose.model("Request", accessRequest);
const EncryptedFile = mongoose.model("EncryptedFile", EncryptedFileSchema);
const AuditLog = mongoose.model("AuditLog", AuditLogSchema);
const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
const RevokedAccessToken = mongoose.model("RevokedAccessToken", revokedAccessTokenSchema);
const Notification = mongoose.model("Notification", notificationSchema);

module.exports = {
  User,
  Admin,
  Request,
  EncryptedFile,
  AuditLog,
  RefreshToken,
  RevokedAccessToken,
  Notification,
  getGridFSBucket
};

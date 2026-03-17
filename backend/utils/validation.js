const { z } = require("zod");

const normalizeWhitespace = (value) =>
  String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeEmail = (value) => normalizeWhitespace(value).toLowerCase();

const sanitizeText = (value, maxLen = 500) => {
  const text = normalizeWhitespace(value);
  return text.length > maxLen ? text.slice(0, maxLen) : text;
};

const normalizeText = (value) => normalizeWhitespace(value);

const sanitizeId = (value) => normalizeWhitespace(value);

const emailSchema = z
  .string()
  .transform(normalizeEmail)
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Invalid email format");

const objectIdSchema = z
  .string()
  .transform(sanitizeId)
  .refine((value) => /^[a-fA-F0-9]{24}$/.test(value), "Invalid ObjectId");

const simpleIdSchema = z
  .string()
  .transform(sanitizeId)
  .refine((value) => /^[A-Za-z0-9_-]{1,128}$/.test(value), "Invalid id format");

const reasonSchema = z
  .string()
  .transform(normalizeText)
  .refine((value) => value.length >= 3, "Reason must be at least 3 characters")
  .refine((value) => value.length <= 500, "Reason must be at most 500 characters");

const optionalDescriptionSchema = z
  .string()
  .optional()
  .transform((value) => (typeof value === "string" ? normalizeText(value) : ""))
  .refine((value) => value.length <= 1000, "Description must be at most 1000 characters");

const validate = (schema, source) => (req, res, next) => {
  const parsed = schema.safeParse(req[source]);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Invalid request";
    return res.status(400).json({ error: message });
  }
  req[source] = parsed.data;
  return next();
};

const validateBody = (schema) => validate(schema, "body");
const validateParams = (schema) => validate(schema, "params");
const validateQuery = (schema) => validate(schema, "query");

const userSchemas = {
  signup: z.object({
    firstname: z.string().transform((value) => sanitizeText(value, 120)).refine((v) => v.length > 0, "firstname is required"),
    lastname: z.string().optional().transform((value) => (typeof value === "string" ? sanitizeText(value, 120) : "")),
    email: emailSchema,
    password: z.string().min(1, "password is required").max(200, "password too long")
  }),
  login: z.object({
    email: emailSchema,
    password: z.string().min(1, "password is required").max(200, "password too long"),
    otp: z.string().optional().transform((value) => (typeof value === "string" ? sanitizeText(value, 20) : undefined))
  }),
  forgotPassword: z.object({
    email: emailSchema
  }),
  resetPassword: z.object({
    token: z
      .string()
      .transform(normalizeText)
      .refine((value) => value.length >= 20, "Invalid reset token")
      .refine((value) => value.length <= 512, "Invalid reset token"),
    password: z.string().min(1, "password is required").max(200, "password too long")
  }),
  refresh: z.object({
  }).passthrough(),
  logout: z
    .object({
      refreshToken: z.string().min(20).max(4000).optional()
    })
    .passthrough(),
  emailOnly: z.object({
    email: emailSchema.optional()
  }),
  requestAccess: z.object({
    email: emailSchema.optional(),
    fileId: objectIdSchema,
    description: optionalDescriptionSchema
  }),
  decrypt: z.object({
    email: emailSchema.optional(),
    fileId: objectIdSchema,
    secretKeyBase64: z.string().min(1, "secretKeyBase64 is required").max(20000, "secretKeyBase64 too long"),
    token: z.string().min(1, "token is required").max(20, "token too long")
  }),
  securityEvent: z.object({
    type: z.enum([
      "ai_lock",
      "forced_reauth",
      "decrypt_start",
      "decrypt_end",
      "ai_boot_error",
      "devtools_tamper",
      "multi_face_detected",
      "face_not_present",
      "screen_reflection_risk",
      "camera_aimed_at_screen",
      "rapid_scene_change",
      "monitoring_tamper"
    ]),
    reason: z
      .string()
      .optional()
      .transform((value) => (typeof value === "string" ? sanitizeText(value, 500) : "")),
    fileId: objectIdSchema.optional(),
    status: z.enum(["success", "failed", "expired"]).optional(),
    metadata: z.record(z.any()).optional(),
    occurredAt: z
      .string()
      .optional()
      .transform((value) => (typeof value === "string" ? sanitizeText(value, 80) : ""))
  }),
  fileListParams: z.object({
    email: emailSchema
  }),
  notificationsQuery: z
    .object({
      limit: z
        .union([z.string(), z.number()])
        .optional()
        .transform((value) => {
          if (value === undefined) return undefined;
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : undefined;
        }),
      unreadOnly: z
        .union([z.string(), z.boolean()])
        .optional()
        .transform((value) => {
          if (typeof value === "boolean") return value;
          if (typeof value === "string") return value.toLowerCase() === "true";
          return undefined;
        })
    })
    .passthrough(),
  notificationParams: z.object({
    notificationId: simpleIdSchema
  })
};

const adminSchemas = {
  signup: userSchemas.signup,
  login: z.object({
    email: emailSchema,
    password: z.string().min(1, "password is required").max(200, "password too long")
  }),
  refresh: userSchemas.refresh,
  logout: userSchemas.logout,
  encryptBody: z.object({
    email: emailSchema
  }),
  approveAccess: z.object({
    requestId: simpleIdSchema
  }),
  rejectParams: z.object({
    requestId: simpleIdSchema
  }),
  userIdParams: z.object({
    userId: objectIdSchema
  }),
  suspendBody: z.object({
    reason: reasonSchema
  }),
  deleteBody: z.object({
    reason: z
      .string()
      .transform(normalizeText)
      .refine((value) => value.length >= 5, "Reason required (min 5 chars)")
      .refine((value) => value.length <= 500, "Reason too long")
  }),
  fileIdParams: z.object({
    fileId: objectIdSchema
  }),
  deleteFileBody: z.object({
    reason: z
      .string()
      .transform(normalizeText)
      .refine((value) => value.length >= 5, "Reason required (min 5 chars)")
      .refine((value) => value.length <= 500, "Reason too long")
  }),
  restoreFileBody: z.object({}).passthrough(),
  bulkDeleteFilesBody: z.object({
    fileIds: z.array(objectIdSchema).min(1, "fileIds is required"),
    reason: z
      .string()
      .transform(normalizeText)
      .refine((value) => value.length >= 5, "Reason required (min 5 chars)")
      .refine((value) => value.length <= 500, "Reason too long")
  }),
  notificationsQuery: userSchemas.notificationsQuery,
  notificationParams: userSchemas.notificationParams
};

module.exports = {
  validateBody,
  validateParams,
  validateQuery,
  userSchemas,
  adminSchemas
};

const nodemailer = (() => {
  try {
    // Optional dependency: email delivery is enabled only when SMTP env is configured.
    return require("nodemailer");
  } catch (_err) {
    return null;
  }
})();

let transporter = null;

const isEmailEnabled = () => {
  if (process.env.NODE_ENV === "test") return false;
  return process.env.EMAIL_NOTIFICATIONS_ENABLED === "true";
};
const normalizeSmtpPassword = (host, pass) => {
  const value = String(pass || "");
  // Gmail app passwords are often copied in grouped format: "abcd efgh ijkl mnop".
  if (String(host || "").toLowerCase().includes("gmail.com")) {
    return value.replace(/\s+/g, "");
  }
  return value;
};

const isEmailConfigured = () => {
  if (!isEmailEnabled()) return false;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = normalizeSmtpPassword(host, process.env.SMTP_PASS);
  return Boolean(host && user && pass);
};

const getTransporter = () => {
  if (!isEmailEnabled()) return null;
  if (!nodemailer) return null;
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = normalizeSmtpPassword(host, process.env.SMTP_PASS);

  if (!host || !user || !pass) return null;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
  return transporter;
};

const createInAppNotification = async (NotificationModel, payload) => {
  if (!NotificationModel) return null;
  return NotificationModel.create(payload);
};

const sendEmailNotification = async ({ to, subject, text }) => {
  const transport = getTransporter();
  if (!transport) return false;

  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  if (!from || !to) return false;

  await transport.sendMail({
    from,
    to,
    subject,
    text
  });
  return true;
};

const DEDUPLICATED_EVENT_TYPES = new Set([
  "request_submitted",
  "request_approved",
  "request_rejected",
  "request_expired",
  "file_deleted",
  "account_suspended",
  "account_unsuspended",
  "account_deleted"
]);

const NOTIFICATION_DEDUPE_WINDOW_MS = Number(process.env.NOTIFICATION_DEDUPE_WINDOW_MS || 10 * 60 * 1000);

const resolveDeduplicationKey = (metadata = {}) => {
  if (!metadata || typeof metadata !== "object") return null;
  const candidates = ["requestId", "fileId", "userId", "sessionId"];
  for (const key of candidates) {
    const value = metadata[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return { key, value: String(value).trim() };
    }
  }
  return null;
};

const notify = async ({
  NotificationModel,
  recipientType,
  recipientEmail,
  eventType,
  title,
  message,
  metadata = {},
  emailSubject,
  emailText
}) => {
  const result = {
    inAppStored: false,
    emailAttempted: Boolean(emailSubject || emailText),
    emailDelivered: false,
    emailConfigured: isEmailConfigured(),
    emailError: null
  };

  try {
    if (!recipientType || !recipientEmail || !eventType || !title || !message) {
      return result;
    }

    const shouldDedupe = Boolean(NotificationModel) && DEDUPLICATED_EVENT_TYPES.has(String(eventType || ""));
    if (shouldDedupe) {
      const dedupeKey = resolveDeduplicationKey(metadata);
      if (dedupeKey) {
        const cutoff = new Date(Date.now() - NOTIFICATION_DEDUPE_WINDOW_MS);
        const existing = await NotificationModel.findOne({
          recipientType,
          recipientEmail,
          eventType,
          [`metadata.${dedupeKey.key}`]: dedupeKey.value,
          createdAt: { $gte: cutoff }
        })
          .select({ _id: 1 })
          .lean();
        if (existing) {
          return result;
        }
      }
    }

    await createInAppNotification(NotificationModel, {
      recipientType,
      recipientEmail,
      eventType,
      title,
      message,
      metadata
    });
    result.inAppStored = true;
  } catch (_err) {
    // Ignore in-app persistence failures to keep business flows stable.
  }

  if (emailSubject || emailText) {
    try {
      result.emailDelivered = await sendEmailNotification({
        to: recipientEmail,
        subject: emailSubject || title,
        text: emailText || message
      });
    } catch (_err) {
      // Ignore email delivery failures to avoid blocking business flows.
      result.emailDelivered = false;
      result.emailError = _err instanceof Error ? _err.message : "email delivery failed";
    }
  }

  return result;
};

module.exports = {
  notify,
  isEmailEnabled,
  isEmailConfigured
};

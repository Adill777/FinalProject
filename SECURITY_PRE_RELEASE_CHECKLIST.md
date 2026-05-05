# Security Pre-Release Checklist

## 1. Secrets and Environment
- [ ] `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`, and `SMTP_PASS` rotated after any exposure.
- [ ] Production env uses non-placeholder secret values only.
- [ ] `COOKIE_SECURE=true` and `COOKIE_SAME_SITE=strict` in production.
- [ ] `CORS_ORIGINS` is explicit and environment-specific.
- [ ] `ADMIN_BOOTSTRAP_TOKEN` is configured in production and used only for controlled admin provisioning.

## 2. Auth and Session Controls
- [ ] Access tokens are short-lived and refresh token rotation is enabled.
- [ ] Refresh reuse and session anomaly detection revoke token family.
- [ ] CSRF checks pass on refresh/logout/logout-all flows.
- [ ] Forgot/reset flow enforces per-account abuse controls.

## 3. Authorization Regression
- [ ] Cross-user access denied for file list/request/decrypt/notification routes.
- [ ] Cross-user body/path email mismatch attempts return `403`.
- [ ] New sensitive routes have automated auth/authorization tests.

## 4. Upload Security
- [ ] MIME allowlist + signature checks + deep content validation pass.
- [ ] Antivirus scanning policy is configured (`ANTIVIRUS_SCAN_ENABLED` and optional external scanner URL).
- [ ] Quarantine/deny behavior verified on malicious test file.

## 5. Logging and Alerting
- [ ] Security alerts are structured and include correlation IDs.
- [ ] Elevated alerts trigger for repeated auth/refresh/reset anomalies.
- [ ] Audit events include reset-token consumption and session events.

## 6. CI Security Gates
- [ ] `npm audit --audit-level=critical` passes for backend/admin/user apps.
- [ ] Semgrep and CodeQL checks pass.
- [ ] ZAP baseline passes against staging target.
- [ ] Dependabot policy workflow enforces severity gate.

## 7. Verification Evidence
- [ ] Store artifacts: test reports, SAST/DAST outputs, vulnerability triage notes.
- [ ] Record risk acceptance decisions (if any) with owner and expiry date.

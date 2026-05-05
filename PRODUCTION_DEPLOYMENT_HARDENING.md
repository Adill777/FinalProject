# Production Deployment Hardening Guide

## Environment Baseline
1. `NODE_ENV=production`
2. `COOKIE_SECURE=true`
3. `COOKIE_SAME_SITE=strict`
4. `CORS_ORIGINS` set to exact frontend origins only
5. Strong `JWT_SECRET` (>= 32 chars random)
6. Strong `ADMIN_BOOTSTRAP_TOKEN` configured for admin provisioning
7. Non-placeholder `GOOGLE_CLIENT_SECRET`, `SMTP_PASS`

## Transport and Edge Security
1. Force HTTPS at reverse proxy/load balancer.
2. Enable HSTS (`Strict-Transport-Security`) at edge.
3. Disable insecure TLS versions/ciphers.
4. Preserve real client IP via trusted proxy config.

## Authentication and Session Hardening
1. Keep refresh tokens in HttpOnly secure cookies.
2. Enforce CSRF on refresh/logout/logout-all.
3. Keep access tokens short-lived.
4. Enable refresh reuse detection and family revocation.

## Abuse and Threat Controls
1. Keep route-level rate limits active for login/refresh/decrypt/forgot/reset.
2. Keep per-account lockout/backoff controls active.
3. Enable anomaly alert thresholds and SIEM forwarding.

## Upload Security
1. Keep MIME allowlist and signature validation enabled.
2. Enable external AV scanner (`ANTIVIRUS_SCAN_URL`) in production.
3. Set `ANTIVIRUS_FAIL_CLOSED=true` for production.
4. Keep strict per-type upload size caps.

## Operational Security
1. Rotate all secrets on schedule and immediately after exposure.
2. Enable centralized structured logs with retention controls.
3. Backup and disaster recovery plan for MongoDB and audit data.
4. Restrict admin access by network and MFA policy.
5. Use bootstrap-token-based admin provisioning only for controlled setup flows.

## Release Gate (Must Pass)
1. Backend security regression tests.
2. `npm audit --audit-level=critical` with no blocking findings.
3. Semgrep + CodeQL pass.
4. OWASP ZAP baseline pass on staging target.

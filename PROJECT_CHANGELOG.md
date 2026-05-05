# Aeronox Project Change Log

This file tracks major implementation changes so project context is not lost over time.

## Security and Access Control

- Added structured response-envelope compatibility paths for user/admin auth and request flows.
- Hardened OTP-required login handling (challenge detection for `otpRequired`, `requiresOtp`, and envelope code paths).
- Added server-side security event endpoint for user telemetry:
  - `POST /api/user/security-events`
  - validated payload schema
  - audit logging + threat-scoring integration
- Added scoped threat blocking behavior so user-side risk events do not block admin APIs:
  - threat keys now use route scope (`user` vs `admin`)

## Decrypt and File Access Flow

- Decrypt view window aligned to 2 minutes and made configurable.
- Added decrypt watermark header contract:
  - user identity
  - timestamp
  - session id
  - IP hash
- User viewer now composes and shows watermark text from decrypt response headers.
- Fixed deleted/unavailable file visibility:
  - request normalization now marks missing/deleted docs as `file_removed`
  - user list now only renders available files from `/api/user/filelist`

## Notification and UX Reliability

- Fixed admin notification replay bug on refresh:
  - initial notification fetch is bootstrapped as seen
  - stale historical events no longer toast as new on reload
- Reduced access-request submit lag:
  - request API responds immediately
  - notification/email fan-out moved to async post-response
  - removed redundant user-side refetch wait after successful submit
- Fixed logout reliability:
  - user portal now calls backend `/api/user/logout` (fallback `/logout-all`) before navigation
  - backend allows logout routes even when temporary threat block is active

## Security Curtain / AI Monitoring

- Implemented local TensorFlow.js + coco-ssd monitoring path with camera-on-demand only during protected viewing.
- Strengthened phone detection:
  - lower threshold for small-object recall
  - extra phone-class matching
  - detector proposal depth increased for small devices
- Added additional high-risk heuristics:
  - multi-person / no-person detection
  - screen reflection / secondary display risk
  - camera aimed at screen heuristic
  - rapid scene change detection
  - devtools tamper signals
- Added dynamic duty cycle + full per-detector hysteresis:
  - risk mode scans faster
  - stable mode scans slower for smoother performance
  - each detector has independent trigger/release counters
- Added policy profile support for monitoring:
  - `strict`, `balanced`, `performance`
  - profile can be passed through `security-curtain-monitoring` event detail

## Recoverability Ladder (Phase 1)

- Added temporary cooldown lock before forced re-auth:
  - elevated risk first triggers temporary lock and automatic resume window
  - repeated high-risk events escalate to forced re-authentication

## Routing and Portal URL Updates

- Admin login route migrated from `/login` to `/admin`.
- Backward compatibility redirect kept:
  - `/login` -> `/admin`
- Admin auth guard now redirects unauthenticated users to `/admin`.

## Validation Status (latest pass)

- Backend tests passing.
- User lint passing.
- Admin lint passing.
- User/admin production builds passing.

## Next Planned Phases

1. Web Crypto key hardening:
   - move private-key handling toward non-exportable key objects and stricter in-memory controls.
2. Client-side decrypt migration:
   - reduce server plaintext exposure in decrypt path while preserving approval workflow.

## Phase 2 Progress (Web Crypto Key Handling)

- Added `secureKeyVault` module in user frontend:
  - wraps private key in-memory using non-exportable AES-GCM Web Crypto key
  - stores encrypted key bytes + IV in module memory only
  - supports read/clear lifecycle for session-scoped usage
- Integrated vault into decrypt flow:
  - optional "remember key in encrypted memory for this session"
  - avoids keeping long-lived raw private key in React state after decrypt
  - clears vault on logout, on page unmount, and when remember toggle is off
- Fail-safe behavior:
  - decrypt still works if vault operations fail or Web Crypto is unavailable.

## Detection Hardening Update

- Strengthened secondary-person and cellphone detection logic in security curtain:
  - added profile-based detector resolution (`strict`/`balanced`/`performance`)
  - added profile-based detector proposal depth and min score tuning
  - added profile-based person/phone thresholds
  - added soft-person corroboration to reduce missed secondary-person cases
- Maintained hysteresis + adaptive duty-cycle behavior while improving recall.

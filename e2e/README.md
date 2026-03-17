# E2E Security Flows

This suite covers the core portal flow and baseline security regressions:

- upload -> request -> approve -> decrypt -> delete
- unauthenticated/unauthorized deny paths
- OTP-required login challenge -> OTP login success
- pre-approval decrypt denied -> post-approval decrypt allowed

## Prerequisites

1. Backend running (`http://localhost:3000` by default).
2. Frontend running (`http://localhost:8081` by default).
3. Playwright installed in backend workspace:
   - `cd backend`
   - `npm install`
   - `npx playwright install`

## Required env vars

- `E2E_RUN=true` (suite is skipped unless enabled)
- Optional: `E2E_API_BASE_URL` (default `http://localhost:3000`)

## Run

From `backend` (while backend app is running):

```bash
npm run test:e2e
```

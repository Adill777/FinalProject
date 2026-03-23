# FreqVault

FreqVault is a confidential file-access platform with separate user and admin portals, a Node/Express backend, approval-based access control, OTP flows, audit logging, and protected-view security controls.

## Repository structure

- `backend/` - Express API, MongoDB integration, auth, access workflows, audit logging
- `FREQVAULT/freqvault_user/` - user-facing Vite + React application
- `FREQVAULT/freqvault_admin/` - admin-facing Vite + React application
- `e2e/` - end-to-end tests and related assets
- `SECURITY_EVIDENCE/` - supporting project security artifacts

## Main features

- user signup, login, OTP verification, password reset
- admin login and user management
- file access request and approval workflow
- short-lived decrypt/view sessions
- audit logging and notifications
- security curtain for protected viewing
- browser-side suspicious-activity detection during confidential access

## Local development

Requirements:

- Node.js 18+
- npm
- MongoDB or MongoDB Atlas

Install dependencies in each app:

```bash
cd backend && npm install
cd ../FREQVAULT/freqvault_user && npm install
cd ../freqvault_admin && npm install
```

Default local URLs:

- backend: `http://localhost:3000`
- admin: `http://localhost:8080`
- user: `http://localhost:8081`

## Root helper scripts

From the repository root:

```bash
npm run dev:backend
npm run dev:admin
npm run dev:user
```

Build:

```bash
npm run build:admin
npm run build:user
```

Lint:

```bash
npm run lint:admin
npm run lint:user
```

Backend tests:

```bash
npm run test:backend
```

## Environment

Use `backend/.env.example` as the starting point for backend configuration.

Frontend apps use:

```env
VITE_API_BASE_URL=http://localhost:3000
```

## Deployment

Recommended production setup:

- user portal on Vercel
- admin portal on Vercel
- backend on Render, Railway, or Fly.io
- MongoDB Atlas for database

See `DEPLOY_VERCEL.md` for the deployment checklist.

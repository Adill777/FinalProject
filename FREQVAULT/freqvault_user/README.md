# Aeronox User Portal

React + Vite frontend for the end-user side of Aeronox.

## Purpose

This app handles:

- user signup and login
- OTP-based sign-in flows
- file access requests
- short-lived protected file viewing
- security curtain and suspicious-activity detection during confidential view

## Local development

Requirements:

- Node.js 18+
- npm
- running backend API

Install and run:

```bash
npm install
npm run dev
```

Default local port:

- `http://localhost:8081`

## Environment

Use the same-origin API path in production and the dev proxy locally:

```env
VITE_API_BASE_URL=
VITE_DEV_API_PROXY_TARGET=http://localhost:3000
VITE_ADMIN_PORTAL_URL=http://localhost:8080/admin
```

Notes:

- Leave `VITE_API_BASE_URL` empty so the app uses `/api` requests in production.
- During local development, the Vite server proxies `/api` to `VITE_DEV_API_PROXY_TARGET`.

## Build

```bash
npm run build
```

## Deployment

This app is intended for Vercel deployment.

- Root directory: `FREQVAULT/freqvault_user`
- Framework: `Vite`
- Output directory: `dist`

SPA rewrites are configured in `vercel.json`.

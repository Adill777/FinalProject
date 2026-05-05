# Aeronox Admin Portal

React + Vite frontend for administrative workflows in Aeronox.

## Purpose

This app handles:

- admin login
- user management
- access request review and approval
- uploaded file management
- audit log visibility
- notification monitoring

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

- `http://localhost:8080`

## Environment

Use the same-origin API path in production and the dev proxy locally:

```env
VITE_API_BASE_URL=
VITE_DEV_API_PROXY_TARGET=http://localhost:3000
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

- Root directory: `FREQVAULT/freqvault_admin`
- Framework: `Vite`
- Output directory: `dist`

SPA rewrites are configured in `vercel.json`.

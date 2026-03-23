# FreqVault User Portal

React + Vite frontend for the end-user side of FreqVault.

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

Set the API base URL with:

```env
VITE_API_BASE_URL=http://localhost:3000
```

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

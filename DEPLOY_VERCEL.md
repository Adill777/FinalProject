# Vercel Deployment Guide

This repository should be deployed as three separate services:

1. `FREQVAULT/freqvault_user` -> Vercel
2. `FREQVAULT/freqvault_admin` -> Vercel
3. `backend` -> Render, Railway, or Fly.io

Do not deploy the current Express backend to Vercel unless you are ready to refactor it into serverless functions.

## Recommended production domains

- User portal: `https://app.yourdomain.com`
- Admin portal: `https://admin.yourdomain.com`
- API: `https://api.yourdomain.com`

Using the same root domain keeps CORS and cookie behavior simpler.

## 1. Deploy the backend first

Host `backend` on Render, Railway, or Fly.io.

Required environment variables:

```env
NODE_ENV=production
PORT=3000
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=replace_with_a_long_random_secret_min_32_chars
ADMIN_BOOTSTRAP_TOKEN=replace_with_a_long_random_bootstrap_secret
COOKIE_SECURE=true
COOKIE_SAME_SITE=strict
TRUST_PROXY=true
CORS_ORIGINS=https://app.yourdomain.com,https://admin.yourdomain.com

GOOGLE_OAUTH_ENABLED=true
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/api/user/auth/google/callback
USER_OAUTH_SUCCESS_REDIRECT=https://app.yourdomain.com/files
USER_OAUTH_FAILURE_REDIRECT=https://app.yourdomain.com/signup
USER_RESET_PASSWORD_REDIRECT_BASE=https://app.yourdomain.com/reset-password

EMAIL_NOTIFICATIONS_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASS=your_smtp_password_or_app_password
EMAIL_FROM=FreqVault <your_email@example.com>
```

Notes:

- Use MongoDB Atlas for production.
- Make sure HTTPS is enabled on the backend host.
- If you do not use Google login or email, disable those flags instead of leaving placeholder values.
- Keep `ADMIN_BOOTSTRAP_TOKEN` secret and only supply it when creating a new production admin.

## 2. Deploy the user portal to Vercel

Create a new Vercel project with:

- Root Directory: `FREQVAULT/freqvault_user`
- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`

Set environment variables:

```env
VITE_API_BASE_URL=https://api.yourdomain.com
```

This project already includes `vercel.json` for SPA route rewrites.

## 3. Deploy the admin portal to Vercel

Create a second Vercel project with:

- Root Directory: `FREQVAULT/freqvault_admin`
- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`

Set environment variables:

```env
VITE_API_BASE_URL=https://api.yourdomain.com
```

This project already includes `vercel.json` for SPA route rewrites.

## 4. Configure custom domains

Attach domains as follows:

- User Vercel project -> `app.yourdomain.com`
- Admin Vercel project -> `admin.yourdomain.com`
- Backend host -> `api.yourdomain.com`

## 5. Configure Google OAuth

In Google Cloud Console:

- Authorized redirect URI:
  - `https://api.yourdomain.com/api/user/auth/google/callback`
- Authorized JavaScript origins:
  - `https://app.yourdomain.com`
  - `https://admin.yourdomain.com`

## 6. Production validation checklist

Test these after deployment:

1. User signup/login
2. OTP-required login
3. Admin login
4. File request submission
5. Admin approval and rejection
6. Decrypt/view flow
7. Refresh on `/files`, `/admin`, `/signup`, `/login`
8. Google OAuth redirect flow
9. Forgot password and reset password flow
10. Notifications and audit logs
11. CORS and cookie-based authenticated requests

## 7. Common failure points

If login works locally but fails in production, check these first:

1. `CORS_ORIGINS` does not include both frontend domains.
2. `COOKIE_SECURE=true` is missing in production.
3. `VITE_API_BASE_URL` still points to localhost.
4. Google redirect URLs still point to localhost.
5. SPA rewrites are missing, causing refresh 404s on nested routes.
6. Backend is hosted on a platform that does not support your current file and streaming behavior well.

## Recommendation

Best low-friction deployment stack for this repository:

- Frontends: Vercel
- Backend: Render or Railway
- Database: MongoDB Atlas
- Email: SMTP provider or Gmail app password

If you later want one-click preview environments, handle that after production is stable. Preview URLs add extra CORS and OAuth complexity.

# Admin Portal Notes

This document provides a short functional summary of the admin portal.

## Main capabilities

- authenticate as admin
- review and approve or reject user file-access requests
- monitor users and uploaded files
- inspect audit logs and notifications
- manage uploaded file lifecycle

## Local run

```bash
npm install
npm run dev
```

Default local URL:

- `http://localhost:8080`

## Backend dependency

The admin portal requires the backend API to be running and reachable through:

```env
VITE_API_BASE_URL=http://localhost:3000
```

## Important note

Do not document or rely on hardcoded admin credentials in repository docs. Use the configured backend admin accounts and environment-specific credentials instead.

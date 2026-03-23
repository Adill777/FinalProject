# Contributing

## Project layout

- `backend/` - Express API and backend tests
- `FREQVAULT/freqvault_user/` - user portal
- `FREQVAULT/freqvault_admin/` - admin portal
- `e2e/` - end-to-end coverage and supporting assets

## Setup

Install dependencies per app:

```bash
cd backend && npm install
cd ../FREQVAULT/freqvault_user && npm install
cd ../freqvault_admin && npm install
```

## Local development

Run apps independently:

```bash
npm run dev:backend
npm run dev:admin
npm run dev:user
```

Default local ports:

- backend: `3000`
- admin: `8080`
- user: `8081`

## Validation

Before pushing, run:

```bash
npm run lint:all
npm run build:all
npm run test:backend
```

## Rules

- Do not commit `.env` files or secrets.
- Keep deployment URLs and secrets configurable through environment variables.
- Prefer small, isolated commits with clear messages.
- Validate auth, request, and decrypt flows after backend API changes.

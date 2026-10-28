# Echovest landing page

## Setup

```bash
npm i
npm run dev
```

The app is a Next.js App Router site and deploys to Vercel without extra configuration. Set `LEADS_WEBHOOK_URL` to forward validated download leads; if it is omitted, leads are only logged by the route handler. Edit download URLs, APK metadata, version, and feature flags in `config/site.ts`.

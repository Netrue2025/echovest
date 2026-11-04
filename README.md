# Echovest landing page

## Setup

```bash
npm i
npm run dev
```

The app is a Next.js App Router site and deploys to Vercel without extra configuration. Set `LEADS_WEBHOOK_URL` to forward validated download leads; if it is omitted, leads are only logged by the route handler. Edit download URLs, APK metadata, version, and feature flags in `config/site.ts`.

## Separate admin PWA on Railway

To install EchoVest Admin separately from the user PWA on Android, give the same frontend Railway service a distinct origin such as `admin.echovest.app`:

1. In the frontend Railway service, open **Settings → Networking → Public Networking → + Custom Domain** and add `admin.echovest.app`.
2. Add the CNAME and TXT records Railway displays to the DNS provider for `echovest.app`. Wait for Railway to verify the domain and issue HTTPS.
3. In the frontend Railway service variables, set `NEXT_PUBLIC_ADMIN_PWA_URL=https://admin.echovest.app/admin`, then redeploy the frontend. This is a build-time variable.
4. In the backend service variables, append `https://admin.echovest.app` to the existing comma-separated `FRONTEND_URL` value. Keep the existing frontend origin in the list, then redeploy the backend.
5. Open `/admin` on the existing site and select **Open separate admin app**. On the new host, use Chrome's menu → **Install app**.

The custom domain points to the same frontend service and code; it does not require another app deployment or database. The separate origin prevents the installed user app from claiming the admin app's install identity. Samsung Internet may still reject WebAPK installation on some versions; Chrome is the supported fallback.

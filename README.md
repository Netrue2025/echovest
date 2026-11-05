# Echovest landing page

## Setup

```bash
npm i
npm run dev
```

The app is a Next.js App Router site and deploys to Vercel without extra configuration. Set `LEADS_WEBHOOK_URL` to forward validated download leads; if it is omitted, leads are only logged by the route handler. Edit download URLs, APK metadata, version, and feature flags in `config/site.ts`.

## Canonical public links

Referral links use `NEXT_PUBLIC_SITE_URL` as their base URL. Set it in the frontend deployment to `https://echovest.app` and rebuild/redeploy the frontend. If it is unset in production, the app defaults to `https://echovest.app`. Local development can set it to the local frontend origin when testing referral links.

## Separate admin PWA on the Railway hostname

The admin install link defaults to `https://echovest-production.up.railway.app/admin`, giving the admin PWA a separate origin and install identity from the user app on `echovest.app`. Both addresses must continue to route to the same current frontend deployment. Open `/admin` on `echovest.app` and choose **Open separate admin app**, then install from the Railway address. Set `NEXT_PUBLIC_ADMIN_PWA_URL` in the frontend Railway service only if you later choose a different admin origin; it is a build-time override.

For admin login, API requests, and push subscription to work from both origins, include both exact origins in the backend Railway service's comma-separated `FRONTEND_URL` value: `https://echovest.app,https://echovest-production.up.railway.app`. Preserve any other required origins and redeploy the backend. Keep the existing VAPID public/private keys and valid `VAPID_SUBJECT` configured on the backend. Push subscriptions are stored by browser endpoint, so admin devices must enable alerts while signed in on the admin-origin PWA; alerts then deliver through the existing backend VAPID configuration. Push delivery requires HTTPS and browser permission. Chrome is the supported Android installation path; Samsung Internet may reject installation on some versions.
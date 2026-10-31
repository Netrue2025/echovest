# EchoVest authentication API

NestJS API for account registration, email OTP verification, signin, signout, and cookie-backed sessions. MongoDB stores users, one active verification code per user, and hashed session tokens. Passwords use Argon2id; OTPs are HMAC hashes; Resend sends verification emails.

## Setup

1. Install Node.js 22.22.3 or newer (the current NestJS toolchain requires Node 22).
2. Copy `.env.example` to `.env` and fill in the values. Keep `.env` private; it is ignored by Git.
3. In MongoDB Atlas, create a database user with access to the target database and allow the development machine's IP in Network Access. Put the URI in `MONGODB_URI`. Do not commit Atlas credentials.
4. In Resend, verify a sending domain and create an API key. Set `RESEND_API_KEY` and `EMAIL_FROM` to an address on that verified domain.
5. Set `FRONTEND_URL` to the exact browser origin(s), comma-separated. For testing on a phone, include the PC's current LAN origin such as `http://192.168.0.146:3000`.
6. Set `SESSION_SECRET` to at least 32 random characters.

## Run locally

From this folder:

```bash
npm install
npm run start:dev
```

The API listens on `0.0.0.0:4000`. From the frontend folder, run `npm run dev -- --hostname 0.0.0.0`. The frontend discovers the API at the same hostname on port 4000; set `NEXT_PUBLIC_API_URL` only when using a different API host.

For phone testing, both devices must be on the same Wi-Fi, Windows Firewall must allow inbound TCP 4000, and the PC's LAN origin must appear in `FRONTEND_URL`. Cookies use `Secure` in production and are intentionally non-secure over local HTTP during development.

## Deploy the backend to Railway

Create a separate Railway service from this repository and set its **Root Directory** to `/backend`. Railway can then install from this package, run `npm run build`, and use `npm start` to launch the compiled API. The API binds to Railway's injected `PORT` and `0.0.0.0`.

Add these variables to the backend service in Railway (do not upload `.env`):

- `MONGODB_URI`: production MongoDB Atlas connection string. Ensure Atlas Network Access permits connections from Railway.
- `RESEND_API_KEY`: Resend API key for the account that owns the verified sender domain.
- `EMAIL_FROM`: valid sender, for example `EchoVest <verify@your-domain.com>`.
- `FRONTEND_URL`: exact public frontend origin, for example `https://your-frontend.up.railway.app` (no path or trailing slash).
- `SESSION_SECRET`: a unique random secret of at least 32 characters.
- `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`: environment-controlled super-admin login. Use a dedicated email and a unique password of at least 12 characters. The backend seeds this account at startup; keep these values private and redeploy the backend after changing them.
- `NODE_ENV`: `production`.
- `SESSION_SAME_SITE`: `none` when the frontend and API are on different sites; use HTTPS. `lax` is suitable when both are same-site.

Generate a public domain for the backend service. In the frontend Railway service, set `NEXT_PUBLIC_API_URL` to that backend's HTTPS origin, without `/auth`, then redeploy the frontend because Next.js embeds this public variable during its build.

## Routes

Admin routes:

- `POST /admin/auth/signin`, `POST /admin/auth/signout`, and `GET /admin/auth/me` provide cookie-backed admin sessions.
- `GET /admin/users` and `PATCH /admin/users/:id`, `PATCH /admin/users/:id/password`, `PATCH /admin/users/:id/controls`, `PATCH /admin/users/:id/withdrawals`, and `DELETE /admin/users/:id` provide permission-protected user administration.
- `GET /admin/admins`, `POST /admin/admins`, `PATCH /admin/admins/:id/permissions`, and `PATCH /admin/admins/:id/status` are super-admin-only routes.

Admin accounts use the same HttpOnly session cookie as user sign-in and are checked against their assigned server-side permissions on every admin request. Disabling a user account or changing their password revokes all active sessions. The withdrawal access flag is stored on the user account for the withdrawal service to enforce when that service is connected.

- `POST /auth/signup` — create an unverified account and send a six-digit OTP.
- `POST /auth/verify-email` — verify the OTP and issue the HttpOnly session cookie.
- `POST /auth/resend-otp` — resend with a server-enforced 60-second cooldown.
- `POST /auth/signin` — verify credentials and issue a session cookie.
- `POST /auth/signout` — revoke the current session and clear the cookie.
- `GET /auth/me` — return the current safe user profile.

All browser mutations check the request Origin against `FRONTEND_URL`; CORS allows only those configured origins with credentials. Session cookies are HttpOnly and expire after 30 days. SameSite defaults to `lax`; for a frontend and API hosted on different sites, set `SESSION_SAME_SITE=none` and use HTTPS (which also enables Secure cookies). OTPs expire after 10 minutes, have five attempts, and are invalidated when used or replaced. Authentication requests are rate-limited.

## Verification

```bash
npm run build
npm test
npm run test:e2e
```

Automated tests should mock Resend and Mongo models; no email or production database is needed for unit tests.

## Web Push notifications

To enable browser push delivery, generate one VAPID key pair from the `backend` directory with `npx web-push generate-vapid-keys`. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` on the backend deployment (for example, `mailto:admin@your-domain.com` for the subject), then redeploy the backend. Keep the private key secret and reuse the same pair across deployments so existing browser subscriptions remain valid. Without these settings, the in-app inbox and admin broadcasts still work, but push subscription and device delivery stay disabled.

Users opt in from Dashboard → Notifications. Admin broadcasts use the Notifications section and require the `notifications.manage` permission. Approved or rejected deposit and withdrawal requests create an in-app notification and send a device push to subscribed users.

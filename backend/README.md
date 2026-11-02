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

## Deposit prototype

The deposit prototype adds an authenticated `GET /wallet/deposit-address?asset=USDT&network=TRON` endpoint. It stores one permanent account per user, asset, and network. The frontend requests this endpoint with the existing EchoVest session cookie. The mock address begins `TEST-TRC20-` and is deliberately not a blockchain address.

Set `DEPOSIT_PROVIDER_MODE=mock` and `NODE_ENV=development` locally to use the TEST simulator. The confirmed test ledger uses MongoDB Decimal128 values with six-decimal precision; pending, failed, invalid, and duplicate events do not increase the TEST balance. The TEST balance is separate from `User.tradingBalance`, referral funds, trade balances, and withdrawal requests. The mock event route is denied outside development mode.

The old `POST /finance/deposits` and admin deposit approval route are disabled so no deposit path in this prototype can credit withdrawable balances. Existing withdrawal behavior is unchanged. Do not send crypto to a TEST address.

### ChainPay configuration and release gate

ChainPay has no documented sandbox/testnet. Keep `CHAINPAY_LIVE_DEPOSITS_ENABLED=false` during development; this leaves live address provisioning disabled. If a separately approved live integration is later enabled, configure all values below on the backend only and verify the flow with a controlled end-to-end transaction before accepting user funds:

- `DEPOSIT_PROVIDER_MODE=chainpay`
- `CHAINPAY_LIVE_DEPOSITS_ENABLED=true` (explicit live address provisioning gate; do not set for this prototype)
- `CHAINPAY_FORWARD_ADDRESS`: verified TRON address owned by EchoVest
- `CHAINPAY_CALLBACK_URL`: public HTTPS URL ending in `/api/webhooks/chainpay`
- `CHAINPAY_WEBHOOK_SECRET`: high-entropy value, at least 32 characters; added as the documented callback `token` query parameter server-side
- `TRON_USDT_CONTRACT`: independently verified USDT TRC20 contract address
- `CHAINPAY_API_KEY`: optional only if required by the ChainPay account/API plan

The ChainPay adapter calls the published `POST /deposit-address` route and status/transactions routes. Provider callbacks are checked for the shared secret, expected asset/network/contract, a known EchoVest external reference, and a unique transaction hash plus status. **The worker does not run unless both `DEPOSIT_PROVIDER_MODE=chainpay` and `CHAINPAY_LIVE_DEPOSITS_ENABLED=true`; mock mode makes no provider or TRON requests.**

#### Independent TRON verification and crediting

Keep these settings on the backend only:

- `TRON_API_URL=https://api.trongrid.io` (mainnet). Use the matching official TRON endpoint for a separately configured test network; its USDT contract must match that network.
- `TRONGRID_API_KEY`: read-only TronGrid API key. Production requests should use a key; never expose it in frontend variables or logs.
- `TRON_MIN_CONFIRMATIONS=19`: required count measured against the SolidityNode solidified block height.
- `TRON_USDT_CONTRACT`: independently verify the official USDT TRC20 contract for the selected network.

For a confirmed event, EchoVest fetches ChainPay's status and transaction records, then requests the transaction receipt and solidified head from TRON's SolidityNode. It checks the transaction ID, successful contract execution, the canonical TRC20 `Transfer` event, exact USDT contract, exact per-user deposit recipient, six-decimal integer amount, and the configured minimum solidified confirmations. All provider and on-chain fields must match the authenticated webhook. Missing or inconsistent fields, API failures, transaction duplicates, and credit transaction failures are retained for admin review and are never treated as a successful credit.

Statuses include `pending`, `reconciling`, `verified_pending_credit`, `crediting`, `credited`, `review_required`, and `rejected`. A transaction is credited only after independent checks pass. Credits use MongoDB Decimal128, an immutable `deposit_ledger_entries` record, unique references by transaction hash, and a Decimal128 `deposit_wallet_accounts` balance incremented in the same MongoDB transaction. MongoDB transactions require a replica set (MongoDB Atlas supports this). The real deposit wallet is deliberately separate from the current trading, referral, and withdrawal balances; this stage does not add deposit withdrawals or trading use.

The authenticated admin review API is `GET /admin/deposit-events/review` and `POST /admin/deposit-events/:id/review`, guarded by the `deposits.manage` permission. Each action requires a reason and is committed in the same MongoDB transaction as an `admin_audit` record. Admins can reject a suspicious event or request reverification; there is no manual balance-edit or manual-credit route.

ChainPay webhooks are unsigned. EchoVest validates the long random query token in constant time, stores only a selected/sanitized subset of the event, expects duplicate delivery, and deduplicates by transaction hash plus provider status. The callback contains its token in the URL: configure proxy, access log, trace, and monitoring redaction for query strings. Never put provider secrets in frontend environment variables.

#### Mock data isolation and database safety

Mock addresses now use the separate `test_deposit_accounts` collection. Mock activity uses `test_ledger_entries`, whose entries must carry `testOnly: true`. Neither mock flow writes `deposit_accounts`, `users`, `deposit_wallet_accounts`, `deposit_ledger_entries`, finance transactions, trades, or referral earnings. Existing mock rows in the older `deposit_accounts` collection are left untouched; new mock accounts are separate. The mock endpoint and address flow require `NODE_ENV=development` and `DEPOSIT_PROVIDER_MODE=mock`. Do not send crypto to a mock address.

Unit tests use in-memory model/fetch mocks; they do not load `AppModule`, connect to MongoDB, or call ChainPay/TRON. No destructive database script, reset, migration, or seed is run by the test commands. Running the local mock API against the shared database will add records only to `test_deposit_accounts` and `test_ledger_entries`; it will not delete or overwrite existing production records, but these are still test records in the shared database and should be treated as such.

Run the isolated verification tests and build with:

```sh
npm test -- --run src/wallet/wallet.service.spec.ts src/deposits/deposits.service.spec.ts src/deposits/tron-verification.service.spec.ts src/deposits/deposit-credit.service.spec.ts src/deposits/deposits.controller.spec.ts src/providers/chainpay/chainpay.service.spec.ts
npm run build
```

Do not enable customer deposits or describe them as operational until production credentials and contract are independently validated, observed operationally, the deployment has verified replica-set transactions and indexes, real ChainPay/TRON contract response formats have been validated using controlled integration procedures, and the complete end-to-end reconciliation and ledger credit workflow has been reviewed. No real deposit withdrawals or trading use is included in this stage. Keep `DEPOSIT_PROVIDER_MODE=mock` and `CHAINPAY_LIVE_DEPOSITS_ENABLED=false` until explicit release approval.

Users opt in from Dashboard → Notifications. Admin broadcasts use the Notifications section and require the `notifications.manage` permission. Approved or rejected deposit and withdrawal requests create an in-app notification and send a device push to subscribed users.

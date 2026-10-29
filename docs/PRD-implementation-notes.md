# Echovest PRD implementation notes

Source: `Copy-Trading-Referral-Platform-PRD-2 (1).docx`, Draft v1.0.

## Product context

- Echovest is a web app plus companion iOS and Android app for wallet deposits, copy trading signals, referrals, levels, and withdrawals.
- A user receives a unique wallet address after signup and can see balances and transaction history in real time.
- Deposits and withdrawals have visible statuses and notifications. Withdrawals target the documented 1–24 hour window.
- Users browse published signals, set an allocation where applicable, and can pause, resume, or stop copying at any time.
- Referrals are three tiers deep. Users can see their downline names and the commission earned from each downliner, not downliner wallet balances.
- Levels are Blue, Elite, Silver, Gold, and Platinum. A level may be reached through team activity or a qualifying buy-in.
- 2FA, secure sessions, audit trails, and a future KYC flow are product requirements.

## Constraints to preserve

- Exact commission percentages, level thresholds, and other numeric referral values are not confirmed; do not invent or display them.
- English-only for this phase.
- The native mobile app mirrors user-facing features; admin is web-only.
- Trading and copy trading carry risk. Do not imply guaranteed returns or risk-free outcomes.

## Current build sequence

1. Welcome/onboarding carousel with three looping slides at `/pwa`.
2. Account creation and sign-in flow.
3. Wallet and deposit status.
4. Signal browsing and copy controls.
5. Referrals, levels, withdrawals, notifications, and security.

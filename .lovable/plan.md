
## Goal

End-to-end ordering with PayPal: buyers pay through the Sellora PayPal account, 10% is kept as platform fee, the remaining 90% lands in the seller's in-app wallet, and sellers withdraw to their own PayPal via PayPal Payouts (no manual API secret entry — sellers connect their PayPal account through OAuth and we store the encrypted refresh token + payer ID).

## 1. Secrets (store, do not hardcode)

Move the credentials you pasted into Lovable Cloud secrets — never commit them. I'll request:
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENV` (`sandbox` or `live`)
- `PAYPAL_WEBHOOK_ID` (for webhook signature verification, you create this in the PayPal dashboard after the webhook URL exists)
- `TOKEN_ENCRYPTION_KEY` (32-byte base64, used by AES-GCM to encrypt seller refresh tokens at rest)

The keys you pasted look like a live REST app credential. Important caveat: **standard PayPal REST apps cannot do Payouts to arbitrary third parties without explicit account-level approval** (PayPal calls this "Payouts" permission, granted per merchant account). If the account isn't approved for Payouts yet, withdrawals will fail at the API call even though the rest of the flow works. I'll surface a clear error in that case.

## 2. Database (new tables + migration)

```text
orders
  id, buyer_id, seller_id, product_id, quantity,
  amount_gross, amount_fee (10%), amount_net (90%),
  currency, status (pending|paid|failed|cancelled|refunded),
  paypal_order_id, paypal_capture_id,
  shipping_address jsonb, buyer_note,
  created_at, updated_at, paid_at

seller_wallets
  user_id (PK), balance_available, balance_pending,
  currency, updated_at

wallet_transactions
  id, user_id, type (credit_sale|debit_withdrawal|debit_fee|reversal),
  amount, currency, order_id, withdrawal_id, note, created_at

withdrawals
  id, user_id, amount, currency, status (pending|processing|paid|failed),
  paypal_payout_batch_id, paypal_payout_item_id,
  failure_reason, created_at, updated_at, paid_at

seller_paypal_accounts
  user_id (PK), payer_id, email,
  refresh_token_encrypted, scope,
  connected_at, updated_at

payment_poll_jobs
  id, order_id, attempts, next_run_at, last_error, done
```

All tables get GRANTs + RLS (users see their own rows; admins see all; wallet inserts go through SECURITY DEFINER triggers so balances can't be tampered with from the client).

A trigger on `orders` status → `paid` automatically credits `seller_wallets.balance_available += amount_net` and inserts a `wallet_transactions` credit row, atomically.

## 3. PayPal integration (server-only)

`src/lib/paypal.server.ts` — token cache, REST helpers:
- `createOrder({ amount, currency, orderId })` → returns approval URL
- `captureOrder(paypalOrderId)`
- `getOrder(paypalOrderId)` (used by polling)
- `createPayout({ email, amount, currency, sender_item_id })`
- `getPayoutItem(itemId)`
- `verifyWebhookSignature(headers, body)`

`src/lib/paypal-oauth.server.ts` — Log in with PayPal flow for sellers:
- `/api/paypal/connect/start` → redirects to PayPal authorize URL
- `/api/paypal/connect/callback` → exchanges code for tokens, fetches `/v1/identity/oauth2/userinfo`, encrypts refresh token with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`, stores in `seller_paypal_accounts`.

Encryption helper in `src/lib/crypto.server.ts` (Node `crypto`, AES-256-GCM, iv + tag stored alongside ciphertext).

## 4. Server routes & functions

- `POST /api/paypal/order/create` (auth) — creates `orders` row + PayPal order, returns approval URL.
- `GET /api/paypal/order/capture?token=...` — PayPal redirect target; captures, marks order paid (trigger credits wallet), redirects to `/orders/:id`.
- `POST /api/public/paypal/webhook` — verifies signature, handles `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `…DENIED`, `…FAILED`.
- `POST /api/wallet/withdraw` (auth) — checks balance, debits available, inserts `withdrawals` row, calls PayPal Payouts to seller's connected email.
- `GET /api/public/paypal/poll-pending` — cron-style: scans pending orders >2 min old, calls `getOrder`, updates status, with exponential backoff via `payment_poll_jobs.attempts` and `next_run_at`. Hit it from pg_cron or an external scheduler (URL is stable).

`createServerFn` wrappers for: `getMyWallet`, `listMyOrders`, `listMySales`, `getOrder`, `listWithdrawals`.

## 5. Frontend

- **Product page** (`src/routes/product.$id.tsx`): add **"Buy now"** button next to "Message seller". Opens `/checkout/$productId`.
- **Checkout page** (new `src/routes/checkout.$productId.tsx`): quantity, shipping address, total breakdown (price + 10% platform fee shown to buyer is **not** added — fee is taken from seller side), "Pay with PayPal" button → calls create endpoint, redirects to PayPal.
- **Order return page** (`src/routes/orders.$id.tsx`): shows status with live polling (re-fetches every 3s while `pending`), success/failure UI, retry button if failed.
- **My orders / My sales** tabs on dashboard.
- **Profile / Shop page**: "Order" button on each product card variant for sellers' shops.
- **Wallet page** (new `src/routes/wallet.tsx`): balance, transactions list, "Connect PayPal" (if not connected) → starts OAuth, "Withdraw" form (min KES 500), withdrawal history.
- **Admin**: add a "Withdrawals" panel and "Orders" panel with status filters and a manual re-poll button.

## 6. Polling & retry strategy

Two layers:
1. Client polls `GET /api/order/:id/status` every 3s for up to 2 min after redirect (covers the common case immediately).
2. Server cron (`/api/public/paypal/poll-pending`) every minute reconciles anything that slipped (webhook missed, user closed tab). Retries with backoff: 30s, 2m, 10m, 1h, 6h, 24h, then marks failed.

## 7. Security notes

- Webhook handler verifies PayPal signature via `/v1/notifications/verify-webhook-signature` using `PAYPAL_WEBHOOK_ID`. Never trust unverified payloads.
- Wallet balance changes only via SQL trigger or `supabaseAdmin` paths — RLS forbids direct UPDATE from clients.
- Refresh tokens encrypted at rest; only the server can decrypt.
- Withdrawal endpoint locks the wallet row (`FOR UPDATE`) inside a transaction to prevent double-spend.

## 8. What I need from you before building

1. **Confirm** I should store the PayPal credentials you pasted as secrets (I'll prompt for `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` + `PAYPAL_ENV` via the secure secrets form — don't paste them in chat again).
2. **PayPal environment**: are those keys **live** or **sandbox**? (The format suggests live. I'd recommend starting in sandbox.)
3. **Payouts approval**: do you know if this PayPal business account is approved for the **Payouts** product? If not, withdrawals will return `AUTHORIZATION_ERROR` until you request it from PayPal — buying/wallet credit still works.
4. **Currency**: orders are listed in product currency (often KES). PayPal doesn't process KES — I'll convert to USD at checkout using the existing currency hook. OK?
5. **Webhook ID**: I'll create the webhook route first; you'll then register it in PayPal dashboard and paste back the resulting `PAYPAL_WEBHOOK_ID` secret.

Once you answer (or just say "go with your defaults"), I'll execute: migration → secrets → server code → frontend → admin panels.

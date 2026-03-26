# ClawPay x402 MVP+

ClawPay is a local product demo for OpenClaw-compatible paid tool routing. It now supports two payment paths side by side:

- `x402-local`: the original demo-safe `402 -> pay -> retry` flow
- `funded-wallet`: a mock-card top-up flow that stores Sepolia hybrid value and spends a USDC balance on paid API calls

## What is included

- Local seller endpoints that return `HTTP 402` before payment
- A tool router with policy checks, automatic payment, retry, and spend ledger
- A funded wallet layer with:
  - mock card top-up
  - Sepolia treasury allocation
  - demo ETH to USDC conversion
  - wallet balance debit on API spend
- A dashboard at `/` showing spend, wallet status, wallet ledger, and funding requests
- A CLI demo that walks through local x402 plus funded wallet flows

## Payment modes

### 1. `x402-local`

This is the original MVP flow:

- seller returns `402`
- router evaluates policy
- router signs a local payment payload
- seller accepts and returns the paid result

### 2. `funded-wallet`

This is the new extension flow:

- user tops up via a mock card form or API
- ClawPay allocates demo Sepolia ETH value
- that value is converted into spendable USDC balance
- the router debits wallet balance before retrying the paid API request

This keeps the same seller-side `402` behavior while changing the payment authorization source.

## Important note

The new funded wallet flow is a **Sepolia hybrid demo**, not a live custody or live swap system.

- top-ups are charged through a mock processor
- treasury allocation is modeled as Sepolia ETH value
- USDC is represented as a spendable demo balance
- tx hashes are generated for audit visibility

This is intentional so the product remains fully runnable in a local environment without external wallets, cards, or bridges.

## Quick start

```bash
npm install --cache /tmp/x402-npm-cache
npm run demo
```

The CLI demo now shows:

1. local x402 allowed purchase
2. local x402 blocked purchase
3. mock card top-up into a funded wallet
4. funded wallet spend on a stock quote API

## Run the dashboard

```bash
npm install --cache /tmp/x402-npm-cache
npm run start
```

Then open:

- `http://127.0.0.1:4020/`

## Dashboard walkthrough

### Local x402 flow

- click `Run Allowed Lookup`
- click `Run Blocked Lookup`

### Funded wallet flow

- leave the default mock card values as-is
- click `Top Up Mock Card`
- click `Spend On Stock Quote` or `Spend On Company Profile`
- click `Trigger Insufficient Balance` to show a blocked wallet payment

## Self-made paid APIs

- `premium-company-profile` at `$0.05`
- `expensive-deep-report` at `$0.50`
- `live-stock-quote` at `$0.02`

These are local seller endpoints under `/seller/*`.

## Funding APIs

- `POST /api/funding/topup`
- `GET /api/funding/wallet/:walletId`
- `POST /api/funding/reset`

Example top-up:

```json
{
  "walletId": "wallet-demo-1",
  "amountUsd": 5,
  "cardNumber": "4242 4242 4242 4242",
  "expiry": "12/30",
  "cvc": "123"
}
```

## Tool Router API

- `POST /api/demo/run`

Example funded wallet call:

```json
{
  "task": "Get a live stock quote for NVDA",
  "sessionId": "demo-session-2",
  "budgetUsd": 1.0,
  "allowedProviders": ["live-stock-quote"],
  "providerId": "live-stock-quote",
  "paymentMode": "funded-wallet",
  "walletId": "wallet-demo-1"
}
```

## Data files

- `data/spend-ledger.json`
- `data/wallet-state.json`
- `data/wallet-ledger.json`
- `data/funding-requests.json`

## Scripts

```bash
npm run dev
npm run start
npm run demo
npm run test
npm run typecheck
```

## Current acceptance coverage

- local x402 flow still works
- policy-based block still works
- mock card top-up works
- funded wallet spend debits balance
- insufficient funded balance blocks a purchase
- spend and wallet ledgers are persisted locally

# OpenClaw x402 MVP — Codex Handoff

## 0. What this is
A 1-day MVP spec for a product that makes **OpenClaw able to safely buy paid APIs on demand using x402**.

The goal is **not** to build a full marketplace or perfect payments platform.
The goal is to build a **working demo** where:

1. OpenClaw asks for a task.
2. A paid API is needed.
3. The system hits an x402-protected endpoint.
4. The system checks policy (`allowlist`, `max_per_call`, `max_per_session`).
5. It pays automatically if allowed.
6. It retries the request.
7. It returns the result plus a spend log.

---

## 1. Product definition

### Working title
- `ClawPay`
- `Paid Tool Router for OpenClaw`
- `OpenClaw Agent Wallet`

### One-liner
**Give OpenClaw a budgeted wallet so it can buy paid APIs on demand, without pre-signups or API keys, and without losing human control.**

### User value
Normal API commerce assumes:
- a human signs up first,
- gets an API key,
- prepays or stores a credit card,
- hard-codes a tool in advance.

This breaks agentic workflows.
The product changes that from **"contract first"** to **"buy at request time"**.

### Core insight
x402 by itself is a payment protocol.
The product is the layer above it:
- service selection,
- spend controls,
- safe automatic payment,
- audit trail.

---

## 2. Why this matters
This project is based on the following problem framing from the idea memo:

- current credit/API-key models assume human signup and pre-configuration,
- credit depletion can stop unattended agent runs,
- tools are fixed in advance,
- small one-off purchases are inefficient,
- agent autonomy is limited,
- x402 enables request-level payment where the server returns price via HTTP 402, the client pays, then retries the request. fileciteturn4file0

The memo also identifies the most important risks and controls:
- unlimited spend,
- looped spend,
- unexpectedly expensive APIs,
- mitigations such as wallet separation, spend caps, allowlists, and human approval for higher-value calls. fileciteturn4file1

---

## 3. What to build in one day

## Build this exact MVP
**An OpenClaw-compatible paid-tool router with policy controls and one working x402 purchase flow.**

### Required capabilities
- At least **1 x402-protected paid endpoint** running locally.
- A **router/tool server** that OpenClaw can call.
- The router must:
  - call the paid endpoint,
  - detect 402/payment requirements,
  - evaluate policy,
  - pay if allowed,
  - retry,
  - return result + spend metadata.
- A small UI or CLI page that shows:
  - total spend,
  - each paid call,
  - blocked calls,
  - remaining session budget.

### Demo must prove
- OpenClaw can trigger a paid tool.
- Payment is automatic.
- Policy gates are enforced.
- Spend is visible.

---

## 4. What NOT to build
Do not spend time on:
- a general marketplace,
- multiple wallet products,
- complex user auth,
- real production custody,
- polished branding,
- many providers,
- dynamic provider ranking,
- browser-side x402 complexity.

Keep the x402 payment path **server-side** for speed and reliability.

---

## 5. Product scope

### Primary user
A builder running OpenClaw who wants the agent to access paid data/services **without pre-registering every API in advance**.

### Canonical use case
> “Research this company. You may use premium tools if needed, but keep total spend under $0.30.”

### User-visible output
The system returns:
- the final answer,
- which paid tools were used,
- how much was spent,
- whether any requests were blocked by policy.

---

## 6. Recommended architecture

## Architecture overview
Use a **single monorepo** with TypeScript.

### Suggested components
1. **Next.js app (App Router, TypeScript)**
   - simple dashboard page
   - optional demo trigger page
   - API route to read spend logs

2. **Tool Router service**
   - can be exposed as:
     - a simple HTTP API for demo speed, or
     - an MCP server if you already know OpenClaw MCP integration well
   - this is the brain of the MVP

3. **x402 Seller endpoint**
   - local paid endpoint protected by x402
   - returns premium JSON data

4. **Policy Engine**
   - allowlist
   - max per call
   - max per session
   - optional approval threshold

5. **Spend Ledger**
   - SQLite or JSON file is enough
   - log all allowed/blocked attempts

### Recommended implementation choice
For a 1-day build, do this:
- **OpenClaw integration path:** simple HTTP tool endpoint first
- **Persistence:** SQLite via Prisma or better-sqlite3, or even a flat JSON file
- **x402 seller:** use the official TypeScript stack
- **policy config:** plain JSON or environment variables

---

## 7. Repo shape

```txt
apps/
  web/
    app/
      page.tsx
      logs/page.tsx
      api/
        demo/route.ts
        logs/route.ts
packages/
  tool-router/
    src/
      index.ts
      router.ts
      policy.ts
      ledger.ts
      types.ts
      paidClient.ts
  seller/
    src/
      server.ts
      premiumData.ts
  shared/
    src/
      types.ts
.env.example
README.md
```

Alternative: collapse into one app if time is tight.

---

## 8. Core flow

```txt
OpenClaw or demo client
  -> tool-router: run premium company lookup
  -> tool-router calls seller endpoint
  -> seller returns HTTP 402 payment requirements
  -> tool-router checks policy
      - provider is allowlisted?
      - price <= max_per_call?
      - session spend + price <= max_per_session?
  -> if denied: log blocked event and return blocked result
  -> if allowed: pay via x402 buyer flow
  -> retry seller endpoint
  -> receive premium result
  -> log spend
  -> return final payload to caller
```

---

## 9. Thin product spec

## 9.1 Features

### Feature A — paid tool call
A user or OpenClaw asks for a premium lookup.
The router calls a paid endpoint and completes the x402 flow.

### Feature B — budget guardrails
Before payment, the router enforces:
- `allowlist`
- `maxPerCallUsd`
- `maxPerSessionUsd`

### Feature C — audit trail
Every payment attempt is logged with:
- timestamp
- tool/provider
- requested price
- approved/blocked
- reason
- session spend after call

### Feature D — demo dashboard
A tiny dashboard shows:
- session budget
- spend so far
- call history
- blocked attempts

---

## 9.2 Non-functional constraints
- must be understandable in under 2 minutes,
- must run locally,
- should use testnet or demo-safe setup,
- should avoid complicated browser wallet flows,
- should not depend on many external providers.

---

## 10. Data model

```ts
export type PaidProvider = {
  id: string;
  name: string;
  endpoint: string;
  category: "company" | "news" | "enrichment";
};

export type PolicyConfig = {
  allowlist: string[];
  maxPerCallUsd: number;
  maxPerSessionUsd: number;
  approvalRequiredAboveUsd?: number;
};

export type SpendLog = {
  id: string;
  timestamp: string;
  sessionId: string;
  providerId: string;
  action: "paid" | "blocked" | "error";
  requestedUsd: number;
  approvedUsd: number;
  reason?: string;
  remainingBudgetUsd: number;
  requestSummary: string;
};

export type ToolExecutionResult = {
  ok: boolean;
  answer?: unknown;
  spendSummary: {
    totalSpentUsd: number;
    callsPaid: number;
    callsBlocked: number;
  };
  events: SpendLog[];
};
```

---

## 11. Exact MVP behavior

## 11.1 Demo endpoints
Build **one real paid endpoint** and optionally one blocked/expensive endpoint.

### Endpoint 1: `premium-company-profile`
Returns mocked but believable premium JSON:
- company summary
- industry
- latest key signals
- simple risk flags

### Endpoint 2: `expensive-deep-report` (optional)
Returns a higher price so policy can block it.

This is enough to demonstrate both:
- successful automated payment,
- blocked payment due to policy.

---

## 11.2 Tool Router contract

### Input
```json
{
  "task": "Research ExampleCorp and use premium tools if useful",
  "sessionId": "demo-session-1",
  "budgetUsd": 0.30,
  "allowedProviders": ["premium-company-profile"]
}
```

### Output
```json
{
  "ok": true,
  "answer": {
    "company": "ExampleCorp",
    "summary": "..."
  },
  "spendSummary": {
    "totalSpentUsd": 0.05,
    "callsPaid": 1,
    "callsBlocked": 0
  },
  "events": []
}
```

Blocked example:
```json
{
  "ok": false,
  "answer": null,
  "spendSummary": {
    "totalSpentUsd": 0.00,
    "callsPaid": 0,
    "callsBlocked": 1
  },
  "events": [
    {
      "action": "blocked",
      "reason": "price exceeds maxPerCallUsd"
    }
  ]
}
```

---

## 12. OpenClaw integration options

## Option A — fastest path
Expose the router as a normal HTTP endpoint and call it from an existing OpenClaw tool/skill wrapper.

## Option B — better demo, more work
Expose the router as an MCP server with one tool like:
- `run_paid_company_lookup`

### Recommendation
Do **Option A** first.
Only add MCP if the HTTP version is already working.

OpenClaw is designed as a personal assistant that runs on your own devices, works across existing channels, and supports setup of channels and skills through its onboarding flow. citeturn649491view0
That makes a tool/skill wrapper a natural integration point. citeturn649491view0

---

## 13. x402 implementation notes

x402 is an HTTP-native payment protocol that revives HTTP 402 so services can return payment requirements, clients can pay programmatically, and then retry to access the resource. citeturn918245search0turn918245search5turn918245search8

The reference TypeScript packages include server/client packages such as `@x402/core`, `@x402/express`, `@x402/fetch`, and `@x402/next`. citeturn649491view1

The official seller quickstart starts with testnet, then switches to production networks such as Base, Polygon, and Solana later. citeturn918245search1

The Bazaar discovery layer exists for discoverability, but it is **not required for the MVP**. It can be a stretch goal after the core flow works. citeturn649491view3

Payments MCP also confirms the exact framing we want for the demo: AI agents discovering and paying for services without API keys, while the human retains spending limits such as max per-call and max per-session. citeturn649491view2

### Practical recommendation
For the MVP:
- protect a local endpoint with x402,
- use testnet-friendly config,
- implement one buyer flow in the router,
- keep discovery/manual provider selection hard-coded.

---

## 14. Acceptance criteria

The build is done if all of the following are true:

### Core
- [ ] Local paid API returns 402 before payment.
- [ ] Router can complete one x402 payment flow successfully.
- [ ] Router retries and gets the paid result.
- [ ] Spend log persists.
- [ ] Policy can block at least one request.

### Demo
- [ ] There is a one-click or one-command demo path.
- [ ] Demo shows both an allowed and a blocked example.
- [ ] UI or CLI prints final spend summary.

### Nice-to-have
- [ ] OpenClaw wrapper/skill exists.
- [ ] MCP server version exists.
- [ ] Bazaar metadata exists.

---

## 15. Suggested implementation order

## Step 1 — seller endpoint
Build a local x402-protected endpoint.

Minimal behavior:
- `GET /premium/company-profile?company=...`
- price = `$0.05`
- returns mock JSON after valid payment

Optional second endpoint:
- `GET /premium/deep-report?company=...`
- price = `$0.50`
- used to trigger a block

## Step 2 — ledger and policy
Implement:
- `getSessionSpend(sessionId)`
- `canApprove(providerId, requestedUsd, policy, sessionSpend)`
- `appendSpendLog(event)`

## Step 3 — paid client in tool-router
Implement a function like:

```ts
async function callPaidProvider(input: {
  sessionId: string;
  providerId: string;
  url: string;
  requestSummary: string;
}): Promise<unknown>
```

Responsibilities:
- make initial request,
- detect payment requirement,
- extract price/payment requirements,
- run policy checks,
- perform payment,
- retry request,
- log result.

## Step 4 — demo endpoint
Expose:
- `POST /api/demo/run`

This endpoint:
- receives a task,
- chooses one provider,
- runs the router,
- returns answer + spend summary.

## Step 5 — minimal UI
One page with:
- “Run allowed demo” button
- “Run blocked demo” button
- current session budget
- table of spend events

## Step 6 — optional OpenClaw wrapper
Add a thin wrapper so OpenClaw can call:
- `run_paid_company_lookup(company, budgetUsd)`

---

## 16. UI spec

## Main page
Sections:
1. Header
   - title
   - one-line explanation
2. Budget panel
   - session budget
   - spent so far
   - remaining
3. Demo controls
   - `Run allowed purchase`
   - `Run blocked purchase`
4. Result panel
   - returned company data
   - explanation of which provider was used
5. Spend log table
   - time
   - provider
   - amount
   - status
   - reason

No fancy design needed.
Make it readable and fast.

---

## 17. Coding rules for Codex

- Use TypeScript everywhere.
- Prefer small pure functions for policy checks.
- Keep configuration centralized.
- Keep payment flow server-side.
- Add comments only where the payment flow is non-obvious.
- Add a README with setup and demo commands.
- If x402 integration blocks progress, do not stall the whole repo:
  - keep the interfaces stable,
  - add a clearly marked fallback/mock path,
  - preserve the demo story.

---

## 18. Fallback strategy if x402 integration gets stuck
If real payment integration becomes the bottleneck, do this fallback while preserving the product story:

### Fallback mode
- seller still returns a synthetic 402-style response,
- router still runs policy checks,
- a `mockPay()` step simulates settlement,
- retry succeeds,
- logs still show the full lifecycle.

### Important
If fallback is used:
- keep the code structured so real x402 can replace `mockPay()` later,
- clearly label fallback mode in the UI and README,
- do not fake production readiness.

---

## 19. Demo script

### Demo A — allowed purchase
1. Input: “Research ExampleCorp with premium tools if needed. Budget: $0.30.”
2. Router calls `premium-company-profile`.
3. Endpoint returns 402.
4. Policy allows `$0.05`.
5. Router pays and retries.
6. Result is shown.
7. Spend panel shows `$0.05 spent`, `1 paid call`.

### Demo B — blocked purchase
1. Input: “Generate a deep premium report. Budget: $0.30.”
2. Router hits expensive endpoint.
3. Endpoint returns 402.
4. Policy blocks because price exceeds per-call or session budget.
5. UI shows blocked event and reason.

This pair of demos is enough for a pitch.

---

## 20. Pitch framing
Use this framing in the product copy and README:

> AI agents cannot truly choose tools dynamically if every API requires humans to sign contracts and provision keys in advance.
> This project gives OpenClaw a controlled wallet so it can buy APIs when needed, under explicit spending and approval rules.

This matches the original memo’s thesis that x402 shifts the model from “humans contract first” to “agents purchase when needed,” while requiring controls like spend caps, allowlists, and approval for higher-cost calls. fileciteturn4file0 fileciteturn4file1

---

## 21. Copy-paste prompt for Codex

```md
Build a local MVP called “ClawPay” using TypeScript.

Goal:
Create a product demo where OpenClaw (or a simple demo endpoint standing in for it) can buy a paid API on demand using x402, under explicit policy controls.

What the app must do:
1. Run a local x402-protected seller endpoint that charges for at least one premium API route.
2. Run a tool-router service that calls that endpoint.
3. The router must detect HTTP 402/payment requirements, evaluate policy (allowlist, maxPerCallUsd, maxPerSessionUsd), pay if allowed, retry, and return the result.
4. Persist a spend log for both paid and blocked attempts.
5. Expose a minimal Next.js App Router UI with:
   - a button for an allowed paid call,
   - a button for a blocked paid call,
   - a spend summary,
   - a spend log table.
6. Add a README with setup and demo instructions.

Implementation constraints:
- Use TypeScript.
- Keep the payment flow server-side.
- Do not build a marketplace.
- Do not build complicated auth.
- Prefer one monorepo.
- If real x402 integration gets blocked, keep the code structure intact and add a clearly labeled fallback/mock settlement path so the end-to-end demo still works.

Suggested structure:
- apps/web for Next.js UI and API routes
- packages/tool-router for payment orchestration, policy, ledger
- packages/seller for x402-protected premium endpoints
- packages/shared for types

Required demos:
- Allowed purchase: price within budget, payment succeeds, result returns, spend log updates.
- Blocked purchase: price above limit, payment is blocked, result explains why, spend log updates.

Please implement in small clear modules, with a good README and runnable local demo.
```

---

## 22. Stretch goals after MVP
Only do these if the core flow already works:
- MCP server wrapper
- OpenClaw skill wrapper
- multiple providers
- provider comparison
- Bazaar discovery metadata / discoverability
- configurable session creation UI
- wallet funding UX

The Bazaar is specifically for discoverability of x402-enabled services and is useful later, but not necessary for the first working product demo. citeturn649491view3

---

## 23. Sources to inspect while coding
- x402 overview
- x402 seller quickstart
- x402 buyer quickstart
- x402 TypeScript repo/examples
- Payments MCP overview
- your own memo PDF in this workspace

Useful facts:
- x402 is designed around HTTP-native programmatic payment using `402 Payment Required`. citeturn918245search0turn918245search8
- Official TypeScript packages exist for server and client integration. citeturn649491view1
- Testnet-first setup is the official quickstart path. citeturn918245search1
- Spending controls such as max per-call and max per-session are aligned with the agentic payments framing in Payments MCP. citeturn649491view2

---

## 24. Final instruction to the implementing agent
Do not optimize for completeness.
Optimize for:
1. a working end-to-end story,
2. visible spend controls,
3. a crisp demo,
4. clean code that can be extended after the pitch.

import http from "node:http";
import express, { Express, Request } from "express";
import { createSellerRouter } from "../../../packages/seller/src/server";
import { sellerProviders } from "../../../packages/seller/src/premiumData";
import { FundingService } from "../../../packages/funding/src/fundingService";
import { FundingRequestStore } from "../../../packages/funding/src/fundingRequests";
import { SpendLedger } from "../../../packages/tool-router/src/ledger";
import { executeTool } from "../../../packages/tool-router/src/router";
import { ToolExecutionInput, TopUpInput } from "../../../packages/shared/src/types";
import { WalletBalanceManager } from "../../../packages/wallet/src/balanceManager";
import { WalletStore } from "../../../packages/wallet/src/store";

const buyerId = process.env.BUYER_ID ?? "clawpay-router";
const buyerSharedSecret = process.env.BUYER_SHARED_SECRET ?? "demo-buyer-secret";
const sellerWalletAddress = process.env.SELLER_WALLET_ADDRESS ?? "demo-seller-wallet";
const defaultWalletId = process.env.DEFAULT_WALLET_ID ?? "wallet-demo-1";

export type AppServices = {
  ledger: SpendLedger;
  walletStore: WalletStore;
  walletManager: WalletBalanceManager;
  fundingService: FundingService;
};

export function createServices(): AppServices {
  const ledger = new SpendLedger();
  const walletStore = new WalletStore();
  const walletManager = new WalletBalanceManager(walletStore);
  const fundingService = new FundingService(walletManager, new FundingRequestStore());

  return { ledger, walletStore, walletManager, fundingService };
}

export function createApp(services = createServices()): Express {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/", (_req, res) => {
    res.type("html").send(renderDashboardHtml());
  });

  app.get("/api/providers", (_req, res) => {
    res.json({ providers: Object.values(sellerProviders) });
  });

  app.get("/api/logs", (req, res) => {
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    const logs = sessionId ? services.ledger.getSessionLogs(sessionId) : services.ledger.readAll();
    const summary = sessionId ? services.ledger.getSessionSummary(sessionId) : null;
    res.json({ logs, summary });
  });

  app.post("/api/logs/reset", (_req, res) => {
    services.ledger.clear();
    res.json({ ok: true });
  });

  app.get("/api/funding/wallet/:walletId", (req, res) => {
    const walletId = req.params.walletId;
    const wallet = services.fundingService.getWallet(walletId);
    const ledger = services.fundingService.getWalletLedger(walletId);
    const fundingRequests = services.fundingService.getFundingRequests(walletId);
    res.json({
      wallet,
      ledger,
      fundingRequests,
      config: services.fundingService.getConfig()
    });
  });

  app.post("/api/funding/topup", (req, res) => {
    const input = parseTopUpInput(req.body);
    const result = services.fundingService.topUp(input);
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post("/api/funding/reset", (_req, res) => {
    services.fundingService.reset();
    res.json({ ok: true });
  });

  app.post("/api/demo/run", (req, res) => {
    void handleToolExecution(req, res, services);
  });

  app.use(
    "/seller",
    createSellerRouter({
      buyerSharedSecret,
      sellerWalletAddress
    })
  );

  return app;
}

export async function startServer(port = Number(process.env.PORT ?? "4020")): Promise<{
  app: Express;
  server: http.Server;
  services: AppServices;
  port: number;
}> {
  const services = createServices();
  const app = createApp(services);
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve server address.");
  }

  return {
    app,
    server,
    services,
    port: address.port
  };
}

async function handleToolExecution(req: Request, res: express.Response, services: AppServices): Promise<void> {
  const input = parseToolInput(req.body);
  const host = req.get("host");

  if (!host) {
    res.status(400).json({ error: "Missing host header." });
    return;
  }

  const sellerBaseUrl = `${req.protocol}://${host}`;
  const result = await executeTool(input, {
    sellerBaseUrl,
    buyerId,
    buyerSharedSecret,
    ledger: services.ledger,
    walletManager: services.walletManager
  });

  res.status(result.ok ? 200 : 403).json(result);
}

function parseToolInput(body: unknown): ToolExecutionInput {
  const data = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const allowedProviders = Array.isArray(data.allowedProviders)
    ? data.allowedProviders.filter((value): value is string => typeof value === "string")
    : [];

  const paymentMode =
    data.paymentMode === "funded-wallet" || data.paymentMode === "x402-local"
      ? data.paymentMode
      : "x402-local";

  return {
    task: typeof data.task === "string" ? data.task : "Research ExampleCorp and use premium tools if useful",
    sessionId: typeof data.sessionId === "string" ? data.sessionId : "demo-session-1",
    budgetUsd: typeof data.budgetUsd === "number" ? data.budgetUsd : 0.3,
    allowedProviders,
    providerId: typeof data.providerId === "string" ? data.providerId : undefined,
    paymentMode,
    walletId: typeof data.walletId === "string" ? data.walletId : paymentMode === "funded-wallet" ? defaultWalletId : undefined
  };
}

function parseTopUpInput(body: unknown): TopUpInput {
  const data = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  return {
    walletId: typeof data.walletId === "string" ? data.walletId : defaultWalletId,
    amountUsd: typeof data.amountUsd === "number" ? data.amountUsd : Number(data.amountUsd ?? 5),
    cardNumber: typeof data.cardNumber === "string" ? data.cardNumber : "4242 4242 4242 4242",
    expiry: typeof data.expiry === "string" ? data.expiry : "12/30",
    cvc: typeof data.cvc === "string" ? data.cvc : "123"
  };
}

function renderDashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ClawPay Dashboard</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4ead8;
        --panel: rgba(255, 250, 242, 0.92);
        --ink: #221f1b;
        --muted: #6a6256;
        --accent: #14532d;
        --accent-2: #d97706;
        --accent-3: #0f766e;
        --danger: #991b1b;
        --border: #d7cdbb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background:
          radial-gradient(circle at top left, rgba(217, 119, 6, 0.25), transparent 24%),
          radial-gradient(circle at right center, rgba(15, 118, 110, 0.18), transparent 28%),
          linear-gradient(135deg, #f8f1e5, #efe3cf 58%, #f6efe3);
        color: var(--ink);
      }
      main {
        max-width: 1180px;
        margin: 0 auto;
        padding: 36px 20px 64px;
      }
      h1 {
        margin: 0;
        font-size: 3.1rem;
        line-height: 1;
      }
      h2 { margin-top: 0; }
      p {
        color: var(--muted);
        max-width: 780px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 16px;
        margin-top: 20px;
      }
      .panel {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 18px;
        box-shadow: 0 14px 34px rgba(34, 31, 27, 0.08);
        backdrop-filter: blur(8px);
      }
      .hero {
        display: grid;
        grid-template-columns: 1.5fr 1fr;
        gap: 16px;
        align-items: stretch;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }
      .metric {
        padding: 12px;
        border-radius: 14px;
        background: #fff;
        border: 1px solid var(--border);
      }
      .metric strong {
        display: block;
        font-size: 1.5rem;
        margin-top: 6px;
      }
      .wallet-metrics {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
      }
      button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 12px 16px;
        font-size: 0.95rem;
        font-weight: 700;
        cursor: pointer;
        margin-right: 10px;
        margin-bottom: 10px;
        background: var(--ink);
        color: #fff;
      }
      button.secondary { background: var(--danger); }
      button.teal { background: var(--accent-3); }
      button.gold { background: var(--accent-2); }
      button.ghost {
        background: transparent;
        color: var(--ink);
        border: 1px solid var(--border);
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 0.9rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.92rem;
      }
      th, td {
        text-align: left;
        padding: 10px 8px;
        border-bottom: 1px solid var(--border);
        vertical-align: top;
      }
      .pill {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 0.8rem;
        background: #e8f5d0;
      }
      .pill.blocked { background: #fbd5d5; }
      .pill.wallet { background: #d8f5f2; }
      .mono { font-family: "SFMono-Regular", Consolas, monospace; }
      form label {
        display: block;
        margin-bottom: 10px;
        font-size: 0.92rem;
      }
      input {
        width: 100%;
        margin-top: 6px;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px 12px;
        font: inherit;
        background: #fff;
      }
      .inline-fields {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 10px;
      }
      .small-note {
        margin-top: 10px;
        font-size: 0.85rem;
      }
      @media (max-width: 900px) {
        .hero {
          grid-template-columns: 1fr;
        }
        .metrics, .wallet-metrics, .inline-fields {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="hero">
        <section class="panel">
          <h1>ClawPay</h1>
          <p>OpenClaw-compatible paid tool router with two payment paths: the original local x402 auto-pay flow, and a funded wallet flow that simulates mock card top-up into Sepolia ETH value and stores spendable USDC balance.</p>
          <p class="small-note">Default session: <span class="mono">demo-session-1</span> | Default wallet: <span class="mono">${defaultWalletId}</span> | Chain: <span class="mono">Sepolia</span></p>
        </section>

        <section class="panel">
          <h2>Session Summary</h2>
          <div class="metrics">
            <div class="metric">
              <span>Total Spent</span>
              <strong id="total-spent">$0.00</strong>
            </div>
            <div class="metric">
              <span>Paid Calls</span>
              <strong id="paid-calls">0</strong>
            </div>
            <div class="metric">
              <span>Blocked Calls</span>
              <strong id="blocked-calls">0</strong>
            </div>
          </div>
        </section>
      </div>

      <div class="grid">
        <section class="panel">
          <h2>Local x402 Flow</h2>
          <p>Original demo-safe x402 flow with automatic pay and retry.</p>
          <button id="run-allowed">Run Allowed Lookup</button>
          <button id="run-blocked" class="secondary">Run Blocked Lookup</button>
          <button id="reset-spend" class="ghost">Reset Spend Ledger</button>
        </section>

        <section class="panel">
          <h2>Fund Wallet</h2>
          <form id="topup-form">
            <label>
              Wallet ID
              <input id="wallet-id" value="${defaultWalletId}" />
            </label>
            <label>
              Amount USD
              <input id="amount-usd" type="number" min="0.05" step="0.01" value="5.00" />
            </label>
            <label>
              Card Number
              <input id="card-number" value="4242 4242 4242 4242" />
            </label>
            <div class="inline-fields">
              <label>
                Expiry
                <input id="expiry" value="12/30" />
              </label>
              <label>
                CVC
                <input id="cvc" value="123" />
              </label>
              <label>
                Chain
                <input value="Sepolia" disabled />
              </label>
            </div>
            <button type="submit" class="gold">Top Up Mock Card</button>
            <button type="button" id="reset-wallet" class="ghost">Reset Wallet State</button>
          </form>
          <p class="small-note">Successful top-ups are recorded as a mock card capture plus a demo ETH to USDC conversion on Sepolia hybrid mode.</p>
        </section>
      </div>

      <div class="grid">
        <section class="panel">
          <h2>Wallet Status</h2>
          <div class="wallet-metrics">
            <div class="metric">
              <span>Available USDC</span>
              <strong id="wallet-available">$0.00</strong>
            </div>
            <div class="metric">
              <span>Pending</span>
              <strong id="wallet-pending">$0.00</strong>
            </div>
            <div class="metric">
              <span>Spent</span>
              <strong id="wallet-spent">$0.00</strong>
            </div>
            <div class="metric">
              <span>Address</span>
              <strong id="wallet-address" class="mono" style="font-size:0.9rem;">-</strong>
            </div>
          </div>
        </section>

        <section class="panel">
          <h2>Funded Wallet Spend</h2>
          <p>Spend from wallet balance while keeping the seller-side 402 flow intact.</p>
          <button id="run-funded-company" class="teal">Spend On Company Profile</button>
          <button id="run-funded-stock" class="teal">Spend On Stock Quote</button>
          <button id="run-funded-insufficient" class="secondary">Trigger Insufficient Balance</button>
        </section>
      </div>

      <div class="grid">
        <section class="panel">
          <h2>Latest Result</h2>
          <pre id="latest-result">Run a scenario to see the router response.</pre>
        </section>

        <section class="panel">
          <h2>Spend Ledger</h2>
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Provider</th>
                <th>Mode</th>
                <th>Requested</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody id="spend-rows">
              <tr><td colspan="5">No spend events yet.</td></tr>
            </tbody>
          </table>
        </section>
      </div>

      <div class="grid">
        <section class="panel">
          <h2>Wallet Ledger</h2>
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Tx Hash</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody id="wallet-rows">
              <tr><td colspan="5">No wallet events yet.</td></tr>
            </tbody>
          </table>
        </section>

        <section class="panel">
          <h2>Funding Requests</h2>
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Amount</th>
                <th>Card</th>
                <th>Tx Hash</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody id="funding-rows">
              <tr><td colspan="5">No funding requests yet.</td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </main>

    <script>
      const sessionId = "demo-session-1";

      function currentWalletId() {
        return document.getElementById("wallet-id").value || "${defaultWalletId}";
      }

      async function runScenario(payload) {
        const response = await fetch("/api/demo/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        document.getElementById("latest-result").textContent = JSON.stringify(result, null, 2);
        await refreshSpend();
        await refreshWallet();
      }

      async function refreshSpend() {
        const response = await fetch("/api/logs?sessionId=" + encodeURIComponent(sessionId));
        const payload = await response.json();
        const summary = payload.summary || { totalSpentUsd: 0, callsPaid: 0, callsBlocked: 0 };
        document.getElementById("total-spent").textContent = "$" + Number(summary.totalSpentUsd).toFixed(2);
        document.getElementById("paid-calls").textContent = String(summary.callsPaid);
        document.getElementById("blocked-calls").textContent = String(summary.callsBlocked);

        const rows = payload.logs.length === 0
          ? '<tr><td colspan="5">No spend events yet.</td></tr>'
          : payload.logs.slice().reverse().map((log) => {
              const pillClass = log.action === "blocked" ? "pill blocked" : "pill";
              return '<tr>' +
                '<td><span class="' + pillClass + '">' + log.action + '</span></td>' +
                '<td><code>' + log.providerId + '</code></td>' +
                '<td>' + (log.paymentMode || "x402-local") + '</td>' +
                '<td>$' + Number(log.requestedUsd).toFixed(2) + '</td>' +
                '<td>' + (log.reason || "") + '</td>' +
              '</tr>';
            }).join("");

        document.getElementById("spend-rows").innerHTML = rows;
      }

      async function refreshWallet() {
        const response = await fetch("/api/funding/wallet/" + encodeURIComponent(currentWalletId()));
        const payload = await response.json();
        const wallet = payload.wallet;

        document.getElementById("wallet-available").textContent = "$" + Number(wallet.availableUsd).toFixed(2);
        document.getElementById("wallet-pending").textContent = "$" + Number(wallet.pendingUsd).toFixed(2);
        document.getElementById("wallet-spent").textContent = "$" + Number(wallet.spentUsd).toFixed(2);
        document.getElementById("wallet-address").textContent = wallet.address;

        const walletRows = payload.ledger.length === 0
          ? '<tr><td colspan="5">No wallet events yet.</td></tr>'
          : payload.ledger.slice().reverse().map((entry) => {
              return '<tr>' +
                '<td><span class="pill wallet">' + entry.action + '</span></td>' +
                '<td>$' + Number(entry.amountUsd).toFixed(2) + '</td>' +
                '<td>' + entry.status + '</td>' +
                '<td class="mono">' + (entry.txHash || "") + '</td>' +
                '<td>' + (entry.reason || "") + '</td>' +
              '</tr>';
            }).join("");

        const fundingRows = payload.fundingRequests.length === 0
          ? '<tr><td colspan="5">No funding requests yet.</td></tr>'
          : payload.fundingRequests.slice().reverse().map((request) => {
              return '<tr>' +
                '<td>' + request.status + '</td>' +
                '<td>$' + Number(request.requestedUsd).toFixed(2) + '</td>' +
                '<td>**** ' + request.cardLast4 + '</td>' +
                '<td class="mono">' + (request.txHash || "") + '</td>' +
                '<td>' + (request.reason || "") + '</td>' +
              '</tr>';
            }).join("");

        document.getElementById("wallet-rows").innerHTML = walletRows;
        document.getElementById("funding-rows").innerHTML = fundingRows;
      }

      document.getElementById("run-allowed").addEventListener("click", () => runScenario({
        task: "Research ExampleCorp and use premium tools if useful",
        sessionId,
        budgetUsd: 0.30,
        allowedProviders: ["premium-company-profile"],
        providerId: "premium-company-profile",
        paymentMode: "x402-local"
      }));

      document.getElementById("run-blocked").addEventListener("click", () => runScenario({
        task: "Create an expensive deep report on ExampleCorp",
        sessionId,
        budgetUsd: 0.30,
        allowedProviders: ["premium-company-profile", "expensive-deep-report"],
        providerId: "expensive-deep-report",
        paymentMode: "x402-local"
      }));

      document.getElementById("run-funded-company").addEventListener("click", () => runScenario({
        task: "Research ExampleCorp and use premium tools if useful",
        sessionId,
        budgetUsd: 1.00,
        allowedProviders: ["premium-company-profile"],
        providerId: "premium-company-profile",
        paymentMode: "funded-wallet",
        walletId: currentWalletId()
      }));

      document.getElementById("run-funded-stock").addEventListener("click", () => runScenario({
        task: "Get a live stock quote for NVDA",
        sessionId,
        budgetUsd: 1.00,
        allowedProviders: ["live-stock-quote"],
        providerId: "live-stock-quote",
        paymentMode: "funded-wallet",
        walletId: currentWalletId()
      }));

      document.getElementById("run-funded-insufficient").addEventListener("click", () => runScenario({
        task: "Research ExampleCorp and use premium tools if useful",
        sessionId,
        budgetUsd: 1.00,
        allowedProviders: ["premium-company-profile"],
        providerId: "premium-company-profile",
        paymentMode: "funded-wallet",
        walletId: "wallet-low-balance"
      }));

      document.getElementById("topup-form").addEventListener("submit", async (event) => {
        event.preventDefault();

        const payload = {
          walletId: currentWalletId(),
          amountUsd: Number(document.getElementById("amount-usd").value),
          cardNumber: document.getElementById("card-number").value,
          expiry: document.getElementById("expiry").value,
          cvc: document.getElementById("cvc").value
        };

        const response = await fetch("/api/funding/topup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        document.getElementById("latest-result").textContent = JSON.stringify(result, null, 2);
        await refreshWallet();
      });

      document.getElementById("reset-wallet").addEventListener("click", async () => {
        await fetch("/api/funding/reset", { method: "POST" });
        document.getElementById("latest-result").textContent = "Wallet state cleared.";
        await refreshWallet();
      });

      document.getElementById("reset-spend").addEventListener("click", async () => {
        await fetch("/api/logs/reset", { method: "POST" });
        document.getElementById("latest-result").textContent = "Spend ledger cleared.";
        await refreshSpend();
      });

      refreshSpend().catch((error) => {
        document.getElementById("latest-result").textContent = String(error);
      });
      refreshWallet().catch((error) => {
        document.getElementById("latest-result").textContent = String(error);
      });
    </script>
  </body>
</html>`;
}

if (require.main === module) {
  void startServer().then(({ port }) => {
    console.log(`ClawPay server listening on http://127.0.0.1:${port}`);
  });
}

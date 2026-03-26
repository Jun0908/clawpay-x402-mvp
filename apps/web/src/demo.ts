import { startServer } from "./server";
import { ToolExecutionResult } from "../../../packages/shared/src/types";

async function main(): Promise<void> {
  const { server, services, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    services.ledger.clear();
    services.fundingService.reset();

    const allowed = await runScenario(baseUrl, {
      task: "Research ExampleCorp and use premium tools if useful",
      sessionId: "demo-session-1",
      budgetUsd: 0.3,
      allowedProviders: ["premium-company-profile"],
      providerId: "premium-company-profile",
      paymentMode: "x402-local"
    });

    const blocked = await runScenario(baseUrl, {
      task: "Create an expensive deep report on ExampleCorp",
      sessionId: "demo-session-1",
      budgetUsd: 0.3,
      allowedProviders: ["premium-company-profile", "expensive-deep-report"],
      providerId: "expensive-deep-report",
      paymentMode: "x402-local"
    });

    const topup = await postJson(baseUrl, "/api/funding/topup", {
      walletId: "wallet-demo-1",
      amountUsd: 5,
      cardNumber: "4242 4242 4242 4242",
      expiry: "12/30",
      cvc: "123"
    });

    const fundedSpend = await runScenario(baseUrl, {
      task: "Get a live stock quote for NVDA",
      sessionId: "demo-session-2",
      budgetUsd: 1.0,
      allowedProviders: ["live-stock-quote"],
      providerId: "live-stock-quote",
      paymentMode: "funded-wallet",
      walletId: "wallet-demo-1"
    });

    const walletState = await fetch(`${baseUrl}/api/funding/wallet/wallet-demo-1`).then((response) => response.json());

    console.log("=== Local x402 allowed purchase ===");
    console.log(JSON.stringify(allowed, null, 2));
    console.log("");
    console.log("=== Local x402 blocked purchase ===");
    console.log(JSON.stringify(blocked, null, 2));
    console.log("");
    console.log("=== Mock card top-up to Sepolia hybrid wallet ===");
    console.log(JSON.stringify(topup, null, 2));
    console.log("");
    console.log("=== Funded wallet spend ===");
    console.log(JSON.stringify(fundedSpend, null, 2));
    console.log("");
    console.log("=== Wallet status ===");
    console.log(JSON.stringify(walletState.wallet, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function runScenario(baseUrl: string, payload: Record<string, unknown>): Promise<ToolExecutionResult> {
  return postJson(baseUrl, "/api/demo/run", payload) as Promise<ToolExecutionResult>;
}

async function postJson(baseUrl: string, route: string, payload: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return response.json();
}

void main();

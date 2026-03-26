import { startServer } from "./server";
import { ToolExecutionResult } from "../../../packages/shared/src/types";

async function main(): Promise<void> {
  const { server, services, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    services.ledger.clear();
    services.fundingService.reset();

    const topup = await postJson(baseUrl, "/api/funding/topup", {
      walletId: "wallet-demo-1",
      amountUsd: 5,
      cardNumber: "4242 4242 4242 4242",
      expiry: "12/30",
      cvc: "123"
    });

    const companySelection = await runScenario(baseUrl, {
      task: "Research ExampleCorp and use premium tools if useful",
      sessionId: "demo-session-company",
      budgetUsd: 1.0,
      allowedProviders: ["premium-company-profile", "external-company-snapshot"],
      paymentMode: "funded-wallet",
      walletId: "wallet-demo-1"
    });

    const stockSelection = await runScenario(baseUrl, {
      task: "Get a live stock quote for NVDA",
      sessionId: "demo-session-stock",
      budgetUsd: 1.0,
      allowedProviders: ["live-stock-quote", "external-stock-snapshot"],
      paymentMode: "funded-wallet",
      walletId: "wallet-demo-1"
    });

    const walletState = await fetch(`${baseUrl}/api/funding/wallet/wallet-demo-1`).then((response) => response.json());

    console.log("=== Top Up Child Wallet From Parent Wallet ===");
    console.log(JSON.stringify(topup, null, 2));
    console.log("");
    console.log("=== AI Selected Company Provider ===");
    console.log(JSON.stringify(companySelection, null, 2));
    console.log("");
    console.log("=== AI Selected Stock Provider ===");
    console.log(JSON.stringify(stockSelection, null, 2));
    console.log("");
    console.log("=== Wallet Hierarchy ===");
    console.log(JSON.stringify({
      parentWallet: walletState.parentWallet,
      childWallet: walletState.wallet,
      hierarchy: walletState.hierarchy
    }, null, 2));
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

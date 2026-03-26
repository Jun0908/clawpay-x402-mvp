import assert from "node:assert/strict";
import test from "node:test";
import { startServer } from "./server";
import { ToolExecutionResult } from "../../../packages/shared/src/types";

test("allowed flow pays and records spend", async () => {
  const { server, services, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    services.ledger.clear();
    services.fundingService.reset();

    const result = await postToolRun(baseUrl, {
      task: "Research ExampleCorp and use premium tools if useful",
      sessionId: "test-session-allowed",
      budgetUsd: 0.3,
      allowedProviders: ["premium-company-profile"],
      providerId: "premium-company-profile",
      paymentMode: "x402-local"
    });

    assert.equal(result.ok, true);
    assert.equal(result.spendSummary.totalSpentUsd, 0.05);
    assert.equal(result.spendSummary.callsPaid, 1);
    assert.equal(result.events[0]?.action, "paid");
  } finally {
    await closeServer(server);
  }
});

test("blocked flow records a policy denial", async () => {
  const { server, services, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    services.ledger.clear();
    services.fundingService.reset();

    const result = await postToolRun(baseUrl, {
      task: "Create an expensive deep report on ExampleCorp",
      sessionId: "test-session-blocked",
      budgetUsd: 0.3,
      allowedProviders: ["premium-company-profile", "expensive-deep-report"],
      providerId: "expensive-deep-report",
      paymentMode: "x402-local"
    });

    assert.equal(result.ok, false);
    assert.equal(result.spendSummary.totalSpentUsd, 0);
    assert.equal(result.spendSummary.callsBlocked, 1);
    assert.equal(result.events[0]?.action, "blocked");
    assert.match(result.events[0]?.reason ?? "", /maxPerCallUsd/);
  } finally {
    await closeServer(server);
  }
});

test("mock card top-up funds a Sepolia hybrid wallet", async () => {
  const { server, services, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    services.ledger.clear();
    services.fundingService.reset();

    const response = await postJson(baseUrl, "/api/funding/topup", {
      walletId: "wallet-test-1",
      amountUsd: 5,
      cardNumber: "4242 4242 4242 4242",
      expiry: "12/30",
      cvc: "123"
    });

    assert.equal(response.ok, true);
    assert.equal(response.wallet.availableUsd, 5);
    assert.equal(response.fundingRequest.status, "funded");
    assert.match(response.treasury.txHash, /^0x[a-f0-9]{64}$/);
  } finally {
    await closeServer(server);
  }
});

test("funded wallet mode debits available balance", async () => {
  const { server, services, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    services.ledger.clear();
    services.fundingService.reset();

    await postJson(baseUrl, "/api/funding/topup", {
      walletId: "wallet-test-2",
      amountUsd: 1,
      cardNumber: "4242 4242 4242 4242",
      expiry: "12/30",
      cvc: "123"
    });

    const result = await postToolRun(baseUrl, {
      task: "Get a live stock quote for NVDA",
      sessionId: "test-session-funded-success",
      budgetUsd: 1,
      allowedProviders: ["live-stock-quote"],
      providerId: "live-stock-quote",
      paymentMode: "funded-wallet",
      walletId: "wallet-test-2"
    });

    assert.equal(result.ok, true);
    assert.equal(result.paymentMode, "funded-wallet");
    assert.equal(result.walletState?.availableUsd, 0.98);
    assert.equal(result.events[0]?.paymentMode, "funded-wallet");
  } finally {
    await closeServer(server);
  }
});

test("funded wallet mode blocks when balance is insufficient", async () => {
  const { server, services, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    services.ledger.clear();
    services.fundingService.reset();

    await postJson(baseUrl, "/api/funding/topup", {
      walletId: "wallet-test-3",
      amountUsd: 0.05,
      cardNumber: "4242 4242 4242 4242",
      expiry: "12/30",
      cvc: "123"
    });

    const firstSpend = await postToolRun(baseUrl, {
      task: "Get a live stock quote for NVDA",
      sessionId: "test-session-funded-blocked",
      budgetUsd: 1,
      allowedProviders: ["live-stock-quote"],
      providerId: "live-stock-quote",
      paymentMode: "funded-wallet",
      walletId: "wallet-test-3"
    });

    assert.equal(firstSpend.ok, true);
    assert.equal(firstSpend.walletState?.availableUsd, 0.03);

    await postToolRun(baseUrl, {
      task: "Get a live stock quote for NVDA",
      sessionId: "test-session-funded-blocked",
      budgetUsd: 1,
      allowedProviders: ["live-stock-quote"],
      providerId: "live-stock-quote",
      paymentMode: "funded-wallet",
      walletId: "wallet-test-3"
    });

    const result = await postToolRun(baseUrl, {
      task: "Research ExampleCorp and use premium tools if useful",
      sessionId: "test-session-funded-blocked",
      budgetUsd: 1,
      allowedProviders: ["premium-company-profile"],
      providerId: "premium-company-profile",
      paymentMode: "funded-wallet",
      walletId: "wallet-test-3"
    });

    assert.equal(result.ok, false);
    assert.equal(result.paymentMode, "funded-wallet");
    assert.match(result.events[0]?.reason ?? "", /insufficient funded balance/);
    assert.equal(result.walletState?.availableUsd, 0.01);
  } finally {
    await closeServer(server);
  }
});

async function postToolRun(baseUrl: string, payload: Record<string, unknown>): Promise<ToolExecutionResult> {
  return postJson(baseUrl, "/api/demo/run", payload) as Promise<ToolExecutionResult>;
}

async function postJson(baseUrl: string, route: string, payload: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return response.json();
}

async function closeServer(server: import("node:http").Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

import assert from "node:assert/strict";
import test from "node:test";
import { startServer } from "./server";
import { ToolExecutionResult } from "../../../packages/shared/src/types";

test("allowed flow pays and records spend", async () => {
  const { server, services, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    resetState(services);

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

test("router selects the cheapest company provider dynamically", async () => {
  const { server, services, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    resetState(services);

    const response = await postJson(baseUrl, "/api/funding/topup", {
      walletId: "wallet-dynamic-1",
      amountUsd: 1,
      cardNumber: "4242 4242 4242 4242",
      expiry: "12/30",
      cvc: "123"
    });

    assert.equal(response.ok, true);

    const result = await postToolRun(baseUrl, {
      task: "Research ExampleCorp and use premium tools if useful",
      sessionId: "dynamic-select-session",
      budgetUsd: 1,
      allowedProviders: ["premium-company-profile", "external-company-snapshot"],
      paymentMode: "funded-wallet",
      walletId: "wallet-dynamic-1"
    });

    assert.equal(result.ok, true);
    assert.equal(result.selectedProvider?.providerId, "external-company-snapshot");
    assert.equal(result.comparedProviders?.length, 2);
    assert.match(result.selectionReason ?? "", /selected cheapest/);
  } finally {
    await closeServer(server);
  }
});

test("approval threshold prevents expensive purchase without auto-execution", async () => {
  await withEnv(
    {
      DEFAULT_MAX_PER_CALL_USD: "1.00",
      DEFAULT_MAX_PER_SESSION_USD: "1.00",
      APPROVAL_REQUIRED_ABOVE_USD: "0.20"
    },
    async () => {
      const { server, services, port } = await startServer(0);
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        resetState(services);

      const result = await postToolRun(baseUrl, {
        task: "Create an expensive deep report on ExampleCorp",
        sessionId: "approval-session",
        budgetUsd: 1,
        allowedProviders: ["expensive-deep-report"],
        providerId: "expensive-deep-report",
        paymentMode: "x402-local"
      });

      assert.equal(result.ok, false);
      assert.equal(result.events[0]?.action, "approval_required");
      assert.match(result.events[0]?.reason ?? "", /approval required/i);
      } finally {
        await closeServer(server);
      }
    }
  );
});

test("daily spend limit blocks purchases after the cap is reached", async () => {
  await withEnv({ DEFAULT_MAX_PER_DAY_USD: "0.03" }, async () => {
    const { server, services, port } = await startServer(0);
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      resetState(services);

      const first = await postToolRun(baseUrl, {
        task: "Get a live stock quote for NVDA",
        sessionId: "daily-cap-a",
        budgetUsd: 1,
        allowedProviders: ["live-stock-quote"],
        providerId: "live-stock-quote",
        paymentMode: "x402-local"
      });

      const second = await postToolRun(baseUrl, {
        task: "Get a live stock quote for NVDA",
        sessionId: "daily-cap-b",
        budgetUsd: 1,
        allowedProviders: ["live-stock-quote"],
        providerId: "live-stock-quote",
        paymentMode: "x402-local"
      });

      assert.equal(first.ok, true);
      assert.equal(second.ok, false);
      assert.match(second.events[0]?.reason ?? "", /maxPerDayUsd/);
    } finally {
      await closeServer(server);
    }
  });
});

test("loop guard blocks repeated provider spend in one session", async () => {
  await withEnv({ MAX_SAME_PROVIDER_CALLS_PER_SESSION: "1" }, async () => {
    const { server, services, port } = await startServer(0);
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      resetState(services);

      const first = await postToolRun(baseUrl, {
        task: "Get a live stock quote for NVDA",
        sessionId: "loop-guard-session",
        budgetUsd: 1,
        allowedProviders: ["live-stock-quote"],
        providerId: "live-stock-quote",
        paymentMode: "x402-local"
      });

      const second = await postToolRun(baseUrl, {
        task: "Get a live stock quote for NVDA",
        sessionId: "loop-guard-session",
        budgetUsd: 1,
        allowedProviders: ["live-stock-quote"],
        providerId: "live-stock-quote",
        paymentMode: "x402-local"
      });

      assert.equal(first.ok, true);
      assert.equal(second.ok, false);
      assert.match(second.events[0]?.reason ?? "", /same provider call limit|repeated request pattern/);
    } finally {
      await closeServer(server);
    }
  });
});

test("mock card top-up funds parent and child wallets with explicit allocation", async () => {
  const { server, services, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    resetState(services);

    const response = await postJson(baseUrl, "/api/funding/topup", {
      walletId: "wallet-test-1",
      amountUsd: 5,
      cardNumber: "4242 4242 4242 4242",
      expiry: "12/30",
      cvc: "123"
    });

    assert.equal(response.ok, true);
    assert.equal(response.wallet.role, "child");
    assert.equal(response.parentWallet.role, "parent");
    assert.equal(response.wallet.availableUsd, 5);
    assert.equal(response.parentWallet.availableUsd, 0);
    assert.equal(response.hierarchy.parentWalletId, "parent:wallet-test-1");
    assert.match(response.treasury.txHash, /^0x[a-f0-9]{64}$/);
  } finally {
    await closeServer(server);
  }
});

test("top-up control blocks excess daily top-ups", async () => {
  await withEnv({ MAX_TOPUPS_PER_DAY: "1" }, async () => {
    const { server, services, port } = await startServer(0);
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      resetState(services);

      const first = await postJson(baseUrl, "/api/funding/topup", {
        walletId: "wallet-test-topup-limit",
        amountUsd: 1,
        cardNumber: "4242 4242 4242 4242",
        expiry: "12/30",
        cvc: "123"
      });

      const second = await postJson(baseUrl, "/api/funding/topup", {
        walletId: "wallet-test-topup-limit",
        amountUsd: 1,
        cardNumber: "4242 4242 4242 4242",
        expiry: "12/30",
        cvc: "123"
      });

      assert.equal(first.ok, true);
      assert.equal(second.ok, false);
      assert.match(second.reason ?? "", /maxTopupsPerDay/);
    } finally {
      await closeServer(server);
    }
  });
});

test("funded wallet mode debits child balance only", async () => {
  const { server, services, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    resetState(services);

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
      allowedProviders: ["live-stock-quote", "external-stock-snapshot"],
      paymentMode: "funded-wallet",
      walletId: "wallet-test-2"
    });

    const walletPayload = await fetch(`${baseUrl}/api/funding/wallet/wallet-test-2`).then((response) => response.json());

    assert.equal(result.ok, true);
    assert.equal(result.paymentMode, "funded-wallet");
    assert.equal(result.walletState?.role, "child");
    assert.equal(walletPayload.wallet.availableUsd, 0.98);
    assert.equal(walletPayload.parentWallet.availableUsd, 0);
  } finally {
    await closeServer(server);
  }
});

test("funded wallet mode blocks when balance is insufficient", async () => {
  const { server, services, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    resetState(services);

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
      sessionId: "other-session-funded-blocked",
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

function resetState(services: { ledger: { clear(): void }; fundingService: { reset(): void } }): void {
  services.ledger.clear();
  services.fundingService.reset();
}

async function withEnv(values: Record<string, string>, callback: () => Promise<void>): Promise<void> {
  const previousValues = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));

  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }

  try {
    await callback();
  } finally {
    for (const [key, value] of Object.entries(previousValues)) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function closeServer(server: import("node:http").Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

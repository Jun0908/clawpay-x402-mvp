import { PaymentMode, ToolExecutionInput, ToolExecutionResult, WalletState } from "../../shared/src/types";
import { WalletBalanceManager } from "../../wallet/src/balanceManager";
import { SpendLedger } from "./ledger";
import { evaluatePolicy } from "./policy";
import { requestPaidResource, retryWithPayment } from "./paidClient";
import { authorizePayment, refundPayment } from "./paymentStrategy";
import { selectProvider } from "./providerSelection";
import { ResolvedPolicyInput } from "./types";

type RouterConfig = {
  sellerBaseUrl: string;
  buyerId: string;
  buyerSharedSecret: string;
  ledger: SpendLedger;
  walletManager?: WalletBalanceManager;
};

export async function executeTool(
  input: ToolExecutionInput,
  config: RouterConfig
): Promise<ToolExecutionResult> {
  const paymentMode = input.paymentMode ?? "x402-local";
  const selection = selectProvider(input);
  const providerId = selection.selectedProvider.providerId;
  const requestSummary = `${providerId}: ${input.task}`;
  const resolvedInput: ResolvedPolicyInput = {
    ...input,
    providerId,
    requestSummary
  };

  const sellerUrl = `${config.sellerBaseUrl}${selection.selectedProvider.endpoint}`;

  try {
    const initial = await requestPaidResource({
      sellerUrl,
      task: input.task,
      sessionId: input.sessionId,
      providerId,
      requestSummary,
      buyerId: config.buyerId,
      buyerSharedSecret: config.buyerSharedSecret
    });

    if (initial.kind === "success") {
      return {
        ok: true,
        answer: initial.answer,
        spendSummary: config.ledger.getSessionSummary(input.sessionId),
        events: [],
        paymentMode,
        walletState: resolveWalletState(paymentMode, input.walletId, config.walletManager),
        selectedProvider: selection.selectedProvider,
        comparedProviders: selection.comparedProviders,
        selectionReason: selection.selectionReason
      };
    }

    const decision = evaluatePolicy(resolvedInput, initial.requirement.amountUsd, config.ledger);

    if (!decision.allowed) {
      const action = decision.action === "approval_required" ? "approval_required" : "blocked";
      const event = config.ledger.append({
        sessionId: input.sessionId,
        providerId,
        action,
        requestedUsd: initial.requirement.amountUsd,
        approvedUsd: 0,
        reason: decision.reason,
        remainingBudgetUsd: decision.remainingBudgetUsd,
        requestSummary,
        paymentMode,
        walletId: input.walletId,
        comparedProviderIds: selection.comparedProviders.map((provider) => provider.providerId),
        selectionReason: selection.selectionReason
      });

      return {
        ok: false,
        answer: null,
        spendSummary: config.ledger.getSessionSummary(input.sessionId),
        events: [event],
        paymentMode,
        walletState: resolveWalletState(paymentMode, input.walletId, config.walletManager),
        selectedProvider: selection.selectedProvider,
        comparedProviders: selection.comparedProviders,
        selectionReason: selection.selectionReason
      };
    }

    const paymentAuthorization = await authorizePayment({
      paymentMode,
      walletId: input.walletId,
      walletManager: config.walletManager,
      amountUsd: initial.requirement.amountUsd,
      sourceRef: `${input.sessionId}:${providerId}:${Date.now()}`,
      reason: `${paymentMode} authorized ${providerId}`
    });

    if (!paymentAuthorization.ok) {
      const event = config.ledger.append({
        sessionId: input.sessionId,
        providerId,
        action: "blocked",
        requestedUsd: initial.requirement.amountUsd,
        approvedUsd: 0,
        reason: paymentAuthorization.reason,
        remainingBudgetUsd: decision.remainingBudgetUsd,
        requestSummary,
        paymentMode,
        walletId: input.walletId,
        comparedProviderIds: selection.comparedProviders.map((provider) => provider.providerId),
        selectionReason: selection.selectionReason
      });

      return {
        ok: false,
        answer: null,
        spendSummary: config.ledger.getSessionSummary(input.sessionId),
        events: [event],
        paymentMode,
        walletState: paymentAuthorization.walletState,
        selectedProvider: selection.selectedProvider,
        comparedProviders: selection.comparedProviders,
        selectionReason: selection.selectionReason
      };
    }

    let paid;
    try {
      paid = await retryWithPayment({
        sellerUrl,
        task: input.task,
        sessionId: input.sessionId,
        providerId,
        requestSummary,
        buyerId: config.buyerId,
        buyerSharedSecret: config.buyerSharedSecret,
        requirement: initial.requirement
      });
    } catch (error) {
      await refundPayment({
        paymentMode,
        walletId: input.walletId,
        walletManager: config.walletManager,
        amountUsd: initial.requirement.amountUsd,
        sourceRef: `${input.sessionId}:${providerId}:refund`,
        reason: "seller retry failed after funded authorization"
      });
      throw error;
    }

    const event = config.ledger.append({
      sessionId: input.sessionId,
      providerId,
      action: "paid",
      requestedUsd: initial.requirement.amountUsd,
      approvedUsd: initial.requirement.amountUsd,
      remainingBudgetUsd: Number(decision.remainingBudgetUsd.toFixed(2)),
      requestSummary,
      paymentMode,
      walletId: input.walletId,
      txHash: paymentAuthorization.txHash,
      comparedProviderIds: selection.comparedProviders.map((provider) => provider.providerId),
      selectionReason: selection.selectionReason
    });

    return {
      ok: true,
      answer: paid.answer,
      spendSummary: config.ledger.getSessionSummary(input.sessionId),
      events: [event],
      paymentMode,
      walletState: paymentAuthorization.walletState,
      selectedProvider: selection.selectedProvider,
      comparedProviders: selection.comparedProviders,
      selectionReason: selection.selectionReason
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown router error";
    const remainingBudgetUsd = Number(
      Math.max(input.budgetUsd - config.ledger.getSessionSummary(input.sessionId).totalSpentUsd, 0).toFixed(2)
    );
    const event = config.ledger.append({
      sessionId: input.sessionId,
      providerId,
      action: "error",
      requestedUsd: 0,
      approvedUsd: 0,
      reason: message,
      remainingBudgetUsd,
      requestSummary,
      paymentMode,
      walletId: input.walletId,
      comparedProviderIds: selection.comparedProviders.map((provider) => provider.providerId),
      selectionReason: selection.selectionReason
    });

    return {
      ok: false,
      answer: null,
      spendSummary: config.ledger.getSessionSummary(input.sessionId),
      events: [event],
      paymentMode,
      walletState: resolveWalletState(paymentMode, input.walletId, config.walletManager),
      selectedProvider: selection.selectedProvider,
      comparedProviders: selection.comparedProviders,
      selectionReason: selection.selectionReason
    };
  }
}

function resolveWalletState(
  paymentMode: PaymentMode,
  walletId: string | undefined,
  walletManager: WalletBalanceManager | undefined
): WalletState | undefined {
  if (paymentMode !== "funded-wallet" || !walletId || !walletManager) {
    return undefined;
  }

  return walletManager.getWallet(walletId);
}

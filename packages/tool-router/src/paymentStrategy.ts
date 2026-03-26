import { WalletBalanceManager } from "../../wallet/src/balanceManager";
import { PaymentMode } from "../../shared/src/types";
import { PaymentAuthorization } from "./types";

export type PaymentStrategyContext = {
  paymentMode: PaymentMode;
  walletId?: string;
  walletManager?: WalletBalanceManager;
  amountUsd: number;
  sourceRef: string;
  reason: string;
};

export async function authorizePayment(context: PaymentStrategyContext): Promise<PaymentAuthorization> {
  if (context.paymentMode === "x402-local") {
    return { ok: true };
  }

  if (!context.walletId || !context.walletManager) {
    return {
      ok: false,
      reason: "walletId is required for funded-wallet mode"
    };
  }

  const result = context.walletManager.debit({
    walletId: context.walletId,
    amountUsd: context.amountUsd,
    sourceRef: context.sourceRef,
    reason: context.reason
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason,
      walletState: result.wallet
    };
  }

  return {
    ok: true,
    txHash: result.txHash,
    walletState: result.wallet
  };
}

export async function refundPayment(context: {
  paymentMode: PaymentMode;
  walletId?: string;
  walletManager?: WalletBalanceManager;
  amountUsd: number;
  sourceRef: string;
  reason: string;
}): Promise<void> {
  if (context.paymentMode !== "funded-wallet" || !context.walletId || !context.walletManager) {
    return;
  }

  context.walletManager.refund({
    walletId: context.walletId,
    amountUsd: context.amountUsd,
    sourceRef: context.sourceRef,
    reason: context.reason
  });
}

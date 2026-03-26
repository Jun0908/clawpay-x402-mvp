import { ToolExecutionInput } from "../../shared/src/types";

export type ResolvedPolicyInput = ToolExecutionInput & {
  providerId: string;
  requestSummary: string;
};

export type PolicyDecision = {
  allowed: boolean;
  reason?: string;
  remainingBudgetUsd: number;
  totalSpentBeforeUsd: number;
};

export type PaymentAuthorization =
  | {
      ok: true;
      txHash?: string;
      walletState?: import("../../shared/src/types").WalletState;
    }
  | {
      ok: false;
      reason: string;
      walletState?: import("../../shared/src/types").WalletState;
    };

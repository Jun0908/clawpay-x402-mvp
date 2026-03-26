import { ToolExecutionInput } from "../../shared/src/types";

export type ResolvedPolicyInput = ToolExecutionInput & {
  providerId: string;
  requestSummary: string;
};

export type PolicyDecision = {
  allowed: boolean;
  action?: "blocked" | "approval_required";
  reason?: string;
  remainingBudgetUsd: number;
  totalSpentBeforeUsd: number;
  totalSpentTodayUsd?: number;
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

import { PolicyConfig } from "../../shared/src/types";
import { SpendLedger } from "./ledger";
import { PolicyDecision, ResolvedPolicyInput } from "./types";

export function resolvePolicyConfig(input: ResolvedPolicyInput): PolicyConfig {
  const configuredAllowlist = input.allowedProviders.length > 0 ? input.allowedProviders : [input.providerId];

  return {
    allowlist: configuredAllowlist,
    maxPerCallUsd: Number(process.env.DEFAULT_MAX_PER_CALL_USD ?? "0.10"),
    maxPerSessionUsd: Math.min(
      Number(process.env.DEFAULT_MAX_PER_SESSION_USD ?? "0.30"),
      Number(input.budgetUsd.toFixed(2))
    ),
    maxPerDayUsd: Number(process.env.DEFAULT_MAX_PER_DAY_USD ?? "1.00"),
    approvalRequiredAboveUsd: Number(process.env.APPROVAL_REQUIRED_ABOVE_USD ?? "0.20"),
    maxSameProviderCallsPerSession: Number(process.env.MAX_SAME_PROVIDER_CALLS_PER_SESSION ?? "2")
  };
}

export function evaluatePolicy(
  input: ResolvedPolicyInput,
  priceUsd: number,
  ledger: SpendLedger,
  policyConfig = resolvePolicyConfig(input)
): PolicyDecision {
  const sessionSummary = ledger.getSessionSummary(input.sessionId);
  const totalSpentBeforeUsd = sessionSummary.totalSpentUsd;
  const totalSpentTodayUsd = ledger.getDaySpendUsd();
  const sameProviderCount = ledger.getSessionProviderPaidCount(input.sessionId, input.providerId);
  const sameRequestCount = ledger.getSessionRequestPaidCount(input.sessionId, input.requestSummary);

  if (!policyConfig.allowlist.includes(input.providerId)) {
    return denied("provider is not allowlisted", totalSpentBeforeUsd, totalSpentTodayUsd, policyConfig);
  }

  if (priceUsd > policyConfig.maxPerCallUsd) {
    return denied("price exceeds maxPerCallUsd", totalSpentBeforeUsd, totalSpentTodayUsd, policyConfig);
  }

  if (totalSpentBeforeUsd + priceUsd > policyConfig.maxPerSessionUsd) {
    return denied("price exceeds remaining session budget", totalSpentBeforeUsd, totalSpentTodayUsd, policyConfig);
  }

  if (totalSpentTodayUsd + priceUsd > policyConfig.maxPerDayUsd) {
    return denied("price exceeds maxPerDayUsd", totalSpentBeforeUsd, totalSpentTodayUsd, policyConfig);
  }

  if (sameProviderCount >= policyConfig.maxSameProviderCallsPerSession) {
    return denied(
      "same provider call limit reached for this session",
      totalSpentBeforeUsd,
      totalSpentTodayUsd,
      policyConfig
    );
  }

  if (sameRequestCount >= policyConfig.maxSameProviderCallsPerSession) {
    return denied(
      "repeated request pattern detected for this session",
      totalSpentBeforeUsd,
      totalSpentTodayUsd,
      policyConfig
    );
  }

  if (
    typeof policyConfig.approvalRequiredAboveUsd === "number" &&
    priceUsd > policyConfig.approvalRequiredAboveUsd
  ) {
    return {
      allowed: false,
      action: "approval_required",
      reason: "approval required above threshold",
      remainingBudgetUsd: roundUsd(policyConfig.maxPerSessionUsd - totalSpentBeforeUsd),
      totalSpentBeforeUsd,
      totalSpentTodayUsd
    };
  }

  return {
    allowed: true,
    remainingBudgetUsd: roundUsd(policyConfig.maxPerSessionUsd - totalSpentBeforeUsd - priceUsd),
    totalSpentBeforeUsd,
    totalSpentTodayUsd
  };
}

function denied(
  reason: string,
  totalSpentBeforeUsd: number,
  totalSpentTodayUsd: number,
  policyConfig: PolicyConfig
): PolicyDecision {
  return {
    allowed: false,
    action: "blocked",
    reason,
    remainingBudgetUsd: roundUsd(policyConfig.maxPerSessionUsd - totalSpentBeforeUsd),
    totalSpentBeforeUsd,
    totalSpentTodayUsd
  };
}

function roundUsd(value: number): number {
  return Number(Math.max(value, 0).toFixed(2));
}

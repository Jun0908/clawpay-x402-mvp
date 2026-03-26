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
    )
  };
}

export function evaluatePolicy(
  input: ResolvedPolicyInput,
  priceUsd: number,
  ledger: SpendLedger,
  policyConfig = resolvePolicyConfig(input)
): PolicyDecision {
  const summary = ledger.getSessionSummary(input.sessionId);
  const totalSpentBeforeUsd = summary.totalSpentUsd;

  if (!policyConfig.allowlist.includes(input.providerId)) {
    return {
      allowed: false,
      reason: "provider is not allowlisted",
      remainingBudgetUsd: roundUsd(policyConfig.maxPerSessionUsd - totalSpentBeforeUsd),
      totalSpentBeforeUsd
    };
  }

  if (priceUsd > policyConfig.maxPerCallUsd) {
    return {
      allowed: false,
      reason: "price exceeds maxPerCallUsd",
      remainingBudgetUsd: roundUsd(policyConfig.maxPerSessionUsd - totalSpentBeforeUsd),
      totalSpentBeforeUsd
    };
  }

  if (totalSpentBeforeUsd + priceUsd > policyConfig.maxPerSessionUsd) {
    return {
      allowed: false,
      reason: "price exceeds remaining session budget",
      remainingBudgetUsd: roundUsd(policyConfig.maxPerSessionUsd - totalSpentBeforeUsd),
      totalSpentBeforeUsd
    };
  }

  return {
    allowed: true,
    remainingBudgetUsd: roundUsd(policyConfig.maxPerSessionUsd - totalSpentBeforeUsd - priceUsd),
    totalSpentBeforeUsd
  };
}

function roundUsd(value: number): number {
  return Number(Math.max(value, 0).toFixed(2));
}

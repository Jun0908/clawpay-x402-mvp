import { ProviderCategory, ProviderQuote, ToolExecutionInput } from "../../shared/src/types";
import { getProviderQuote, getProviderQuotes } from "../../seller/src/premiumData";

export type ProviderSelection = {
  selectedProvider: ProviderQuote;
  comparedProviders: ProviderQuote[];
  selectionReason: string;
};

export function selectProvider(input: ToolExecutionInput): ProviderSelection {
  const explicit = input.providerId ? getProviderQuote(input.providerId) : undefined;
  const comparedProviders = getCandidateProviders(input);

  if (explicit) {
    return {
      selectedProvider: explicit,
      comparedProviders,
      selectionReason: "provider explicitly requested by caller"
    };
  }

  const selectedProvider = comparedProviders[0];
  if (!selectedProvider) {
    throw new Error("No compatible providers found for this task.");
  }

  return {
    selectedProvider,
    comparedProviders,
    selectionReason: `selected cheapest ${selectedProvider.category} provider for task`
  };
}

export function getCandidateProviders(input: ToolExecutionInput): ProviderQuote[] {
  const category = inferCategory(input.task);
  const allowlist = input.allowedProviders.length > 0 ? new Set(input.allowedProviders) : undefined;

  return getProviderQuotes()
    .filter((provider) => provider.category === category)
    .filter((provider) => (allowlist ? allowlist.has(provider.providerId) : true))
    .sort((left, right) => left.priceUsd - right.priceUsd);
}

function inferCategory(task: string): ProviderCategory {
  const normalizedTask = task.toLowerCase();

  if (normalizedTask.includes("stock") || normalizedTask.includes("quote") || normalizedTask.includes("ticker")) {
    return "market";
  }

  return "company";
}

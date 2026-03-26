import { PaidProvider, ProviderQuote } from "../../shared/src/types";

export type SellerProvider = PaidProvider & {
  priceUsd: number;
  description: string;
  source: "local" | "external";
};

export const localSellerProviders: Record<string, SellerProvider> = {
  "premium-company-profile": {
    id: "premium-company-profile",
    name: "Premium Company Profile",
    endpoint: "/seller/premium-company-profile",
    category: "company",
    priceUsd: 0.05,
    description: "Believable premium company profile with summary, signals, and risk flags.",
    source: "local"
  },
  "expensive-deep-report": {
    id: "expensive-deep-report",
    name: "Expensive Deep Report",
    endpoint: "/seller/expensive-deep-report",
    category: "company",
    priceUsd: 0.5,
    description: "Higher-priced premium report used to demonstrate policy blocking.",
    source: "local"
  },
  "live-stock-quote": {
    id: "live-stock-quote",
    name: "Live Stock Quote",
    endpoint: "/seller/live-stock-quote",
    category: "market",
    priceUsd: 0.02,
    description: "Simple market quote API that returns a stock snapshot and intraday signal.",
    source: "local"
  }
};

export const externalSellerProviders: Record<string, SellerProvider> = {
  "external-company-snapshot": {
    id: "external-company-snapshot",
    name: "External Company Snapshot",
    endpoint: "/external-seller/external-company-snapshot",
    category: "company",
    priceUsd: 0.03,
    description: "External-style seller that returns a lean company snapshot without requiring pre-registration.",
    source: "external"
  },
  "external-stock-snapshot": {
    id: "external-stock-snapshot",
    name: "External Stock Snapshot",
    endpoint: "/external-seller/external-stock-snapshot",
    category: "market",
    priceUsd: 0.025,
    description: "External-style seller that returns a lightweight stock snapshot for ad-hoc lookups.",
    source: "external"
  }
};

export const sellerProviders: Record<string, SellerProvider> = {
  ...localSellerProviders,
  ...externalSellerProviders
};

export const providerQuotes: ProviderQuote[] = Object.values(sellerProviders).map((provider) => ({
  providerId: provider.id,
  name: provider.name,
  priceUsd: provider.priceUsd,
  category: provider.category,
  description: provider.description,
  endpoint: provider.endpoint,
  source: provider.source
}));

export function getSellerProvider(providerId: string): SellerProvider | undefined {
  return sellerProviders[providerId];
}

export function getProviderQuote(providerId: string): ProviderQuote | undefined {
  return providerQuotes.find((quote) => quote.providerId === providerId);
}

export function getProviderQuotes(): ProviderQuote[] {
  return providerQuotes;
}

export function buildSellerResult(providerId: string, task: string): unknown {
  if (providerId === "live-stock-quote" || providerId === "external-stock-snapshot") {
    const symbol = extractTicker(task);
    const price = symbol === "NVDA" ? 141.82 : symbol === "AAPL" ? 213.44 : 182.15;
    const changePercent = symbol === "NVDA" ? 1.6 : symbol === "AAPL" ? -0.4 : 0.8;

    return {
      symbol,
      providerId,
      priceUsd: price,
      changePercent,
      signal: changePercent >= 0 ? "positive intraday momentum" : "slight intraday pullback",
      source: providerId.startsWith("external") ? "demo-external seller" : "demo-local x402 seller"
    };
  }

  const company = extractCompanyName(task);

  if (providerId === "expensive-deep-report") {
    return {
      company,
      providerId,
      summary: `${company} is showing mixed expansion signals with elevated capital intensity and execution risk across new lines of business.`,
      industry: "Enterprise Software",
      keySignals: [
        "Quarter-over-quarter hiring remains positive in go-to-market roles.",
        "Enterprise customer concentration is trending down, which improves resilience.",
        "Two recent product launches indicate continued expansion into adjacent workflows."
      ],
      riskFlags: [
        "Margins may compress if infrastructure spend keeps rising.",
        "Go-to-market efficiency is improving slowly relative to peers.",
        "Leadership transition risk remains moderately elevated."
      ],
      source: "demo-local x402 seller"
    };
  }

  if (providerId === "external-company-snapshot") {
    return {
      company,
      providerId,
      summary: `${company} is an external snapshot result optimized for low-cost ad-hoc use with a shorter but cheaper output.`,
      industry: "Software",
      keySignals: [
        "Compact external snapshot available on demand.",
        "Useful when the agent needs a cheaper company lookup.",
        "No signup or API key required in this demo flow."
      ],
      riskFlags: [
        "Result depth is intentionally lower than the premium internal profile."
      ],
      source: "demo-external seller"
    };
  }

  return {
    company,
    providerId,
    summary: `${company} appears to be a healthy mid-stage software business with clear category positioning, improving sales efficiency, and manageable downside risk.`,
    industry: "B2B SaaS",
    keySignals: [
      "Steady hiring in product and customer success.",
      "Recent partnership activity suggests ecosystem expansion.",
      "Customer retention appears strong based on public signals."
    ],
    riskFlags: [
      "International expansion is still early and may create operational drag.",
      "Competition is increasing in the mid-market segment."
    ],
    source: "demo-local x402 seller"
  };
}

function extractTicker(task: string): string {
  const explicit = task.match(/\b([A-Z]{1,5})\b/);
  if (explicit?.[1]) {
    return explicit[1];
  }

  if (task.toLowerCase().includes("apple")) {
    return "AAPL";
  }

  return "NVDA";
}

function extractCompanyName(task: string): string {
  const match = task.match(
    /(?:research|lookup|profile)\s+([A-Za-z0-9 .,&-]+?)(?:\s+and\s+use|\s*$)|report\s+on\s+([A-Za-z0-9 .,&-]+?)(?:\s*$)/i
  );

  const extracted = match?.[1] ?? match?.[2];
  if (extracted) {
    return extracted.trim().replace(/\.$/, "");
  }

  const quoted = task.match(/"([^"]+)"/);
  if (quoted?.[1]) {
    return quoted[1].trim();
  }

  return "ExampleCorp";
}

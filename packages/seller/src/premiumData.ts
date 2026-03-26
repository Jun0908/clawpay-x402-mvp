import { PaidProvider } from "../../shared/src/types";

export type SellerProvider = PaidProvider & {
  priceUsd: number;
  description: string;
};

export const sellerProviders: Record<string, SellerProvider> = {
  "premium-company-profile": {
    id: "premium-company-profile",
    name: "Premium Company Profile",
    endpoint: "/seller/premium-company-profile",
    category: "company",
    priceUsd: 0.05,
    description: "Believable premium company profile with summary, signals, and risk flags."
  },
  "expensive-deep-report": {
    id: "expensive-deep-report",
    name: "Expensive Deep Report",
    endpoint: "/seller/expensive-deep-report",
    category: "company",
    priceUsd: 0.5,
    description: "Higher-priced premium report used to demonstrate policy blocking."
  },
  "live-stock-quote": {
    id: "live-stock-quote",
    name: "Live Stock Quote",
    endpoint: "/seller/live-stock-quote",
    category: "market",
    priceUsd: 0.02,
    description: "Simple market quote API that returns a stock snapshot and intraday signal."
  }
};

export function getSellerProvider(providerId: string): SellerProvider | undefined {
  return sellerProviders[providerId];
}

export function buildSellerResult(providerId: string, task: string): unknown {
  if (providerId === "live-stock-quote") {
    const symbol = extractTicker(task);
    const price = symbol === "NVDA" ? 141.82 : symbol === "AAPL" ? 213.44 : 182.15;
    const changePercent = symbol === "NVDA" ? 1.6 : symbol === "AAPL" ? -0.4 : 0.8;

    return {
      symbol,
      providerId,
      priceUsd: price,
      changePercent,
      signal: changePercent >= 0 ? "positive intraday momentum" : "slight intraday pullback",
      source: "demo-local x402 seller"
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

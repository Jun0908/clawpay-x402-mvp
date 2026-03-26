export type ProviderCategory = "company" | "news" | "enrichment" | "market";

export type PaidProvider = {
  id: string;
  name: string;
  endpoint: string;
  category: ProviderCategory;
};

export type PolicyConfig = {
  allowlist: string[];
  maxPerCallUsd: number;
  maxPerSessionUsd: number;
  maxPerDayUsd: number;
  approvalRequiredAboveUsd?: number;
  maxSameProviderCallsPerSession: number;
};

export type SpendLogAction = "paid" | "blocked" | "approval_required" | "error";

export type SpendLog = {
  id: string;
  timestamp: string;
  sessionId: string;
  providerId: string;
  action: SpendLogAction;
  requestedUsd: number;
  approvedUsd: number;
  reason?: string;
  remainingBudgetUsd: number;
  requestSummary: string;
  paymentMode?: PaymentMode;
  walletId?: string;
  txHash?: string;
  comparedProviderIds?: string[];
  selectionReason?: string;
};

export type SpendSummary = {
  totalSpentUsd: number;
  callsPaid: number;
  callsBlocked: number;
};

export type ToolExecutionInput = {
  task: string;
  sessionId: string;
  budgetUsd: number;
  allowedProviders: string[];
  providerId?: string;
  paymentMode?: PaymentMode;
  walletId?: string;
  autoSelectProviders?: boolean;
};

export type ToolExecutionResult = {
  ok: boolean;
  answer: unknown | null;
  spendSummary: SpendSummary;
  events: SpendLog[];
  paymentMode?: PaymentMode;
  walletState?: WalletState;
  selectedProvider?: ProviderQuote;
  comparedProviders?: ProviderQuote[];
  selectionReason?: string;
};

export type PaymentMode = "x402-local" | "funded-wallet";

export type PaymentRequirement = {
  x402Version: "2";
  paymentId: string;
  providerId: string;
  resource: string;
  description: string;
  amountUsd: number;
  scheme: "demo-exact";
  network: "demo-local";
  asset: "USD";
  payTo: string;
  expiresAt: string;
};

export type PaymentPayload = {
  paymentId: string;
  providerId: string;
  amountUsd: number;
  sessionId: string;
  buyerId: string;
  requestSummary: string;
  timestamp: string;
};

export type SignedPayment = {
  payload: PaymentPayload;
  signature: string;
};

export type SettlementResponse = {
  paymentId: string;
  providerId: string;
  amountUsd: number;
  status: "settled";
  settledAt: string;
  network: "demo-local";
};

export type FundingRequest = {
  id: string;
  walletId: string;
  parentWalletId?: string;
  childWalletId?: string;
  source: "mock-card";
  cardLast4: string;
  requestedUsd: number;
  status: "pending" | "funded" | "failed";
  createdAt: string;
  fundedAt?: string;
  txHash?: string;
  reason?: string;
};

export type WalletState = {
  walletId: string;
  role: "parent" | "child";
  parentWalletId?: string;
  chain: "sepolia";
  address: string;
  assetSymbol: "USDC";
  availableUsd: number;
  pendingUsd: number;
  spentUsd: number;
  allocatedUsd: number;
  lastFundedAt?: string;
};

export type WalletLedgerAction = "topup" | "swap" | "allocation" | "debit" | "refund" | "error";

export type WalletLedgerEntry = {
  id: string;
  walletId: string;
  action: WalletLedgerAction;
  amountUsd: number;
  amountEth?: number;
  status: "pending" | "completed" | "failed";
  sourceRef?: string;
  txHash?: string;
  reason?: string;
  timestamp: string;
  relatedWalletId?: string;
};

export type FundingConfig = {
  minTopupUsd: number;
  maxTopupUsd: number;
  maxTopupsPerDay: number;
  maxTopupPerDayUsd: number;
  defaultChain: "sepolia";
  swapMode: "demo" | "onchain";
};

export type TopUpInput = {
  walletId: string;
  amountUsd: number;
  cardNumber: string;
  expiry: string;
  cvc: string;
};

export type WalletHierarchy = {
  parentWalletId: string;
  childWalletId: string;
  allocatedUsd: number;
};

export type ProviderQuote = {
  providerId: string;
  name: string;
  priceUsd: number;
  category: ProviderCategory;
  description: string;
  endpoint: string;
  source: "local" | "external";
};

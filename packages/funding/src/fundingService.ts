import { FundingConfig, FundingRequest, TopUpInput, WalletHierarchy, WalletState } from "../../shared/src/types";
import { WalletBalanceManager } from "../../wallet/src/balanceManager";
import { chargeMockCard } from "./mockCard";
import { FundingRequestStore } from "./fundingRequests";
import { SepoliaTreasury } from "./treasury";

type TopUpResult = {
  ok: boolean;
  fundingRequest: FundingRequest;
  wallet: WalletState;
  parentWallet: WalletState;
  hierarchy: WalletHierarchy;
  treasury: {
    chain: "sepolia";
    treasuryAddress: string;
    amountEth: number;
    txHash: string;
    swapMode: "demo";
  };
  reason?: string;
};

export class FundingService {
  constructor(
    private readonly walletManager: WalletBalanceManager,
    private readonly requestStore: FundingRequestStore,
    private readonly treasury = new SepoliaTreasury(),
    private readonly config: FundingConfig = {
      minTopupUsd: Number(process.env.MIN_TOPUP_USD ?? "0.05"),
      maxTopupUsd: Number(process.env.MAX_TOPUP_USD ?? "25.00"),
      maxTopupsPerDay: Number(process.env.MAX_TOPUPS_PER_DAY ?? "2"),
      maxTopupPerDayUsd: Number(process.env.MAX_TOPUP_PER_DAY_USD ?? "25.00"),
      defaultChain: "sepolia",
      swapMode: "demo"
    }
  ) {}

  getConfig(): FundingConfig {
    return this.config;
  }

  getWallet(walletId: string): WalletState {
    return this.walletManager.getWallet(walletId);
  }

  getParentWallet(walletId: string): WalletState {
    return this.walletManager.getParentWallet(walletId);
  }

  getWalletHierarchy(walletId: string): WalletHierarchy {
    return this.walletManager.getHierarchy(walletId);
  }

  getWalletLedger(walletId?: string) {
    return this.walletManager.getLedger(walletId);
  }

  getFundingRequests(walletId?: string): FundingRequest[] {
    return this.requestStore.getByWallet(walletId);
  }

  reset(): void {
    this.walletManager.reset();
    this.requestStore.reset();
  }

  topUp(input: TopUpInput): TopUpResult {
    const wallet = this.walletManager.getWallet(input.walletId);
    const parentWallet = this.walletManager.getParentWallet(input.walletId);
    const hierarchy = this.walletManager.getHierarchy(input.walletId);

    if (input.amountUsd < this.config.minTopupUsd) {
      return failedTopup({
        input,
        wallet,
        parentWallet,
        hierarchy,
        requestStore: this.requestStore,
        treasuryAddress: this.treasury.allocateForUsd(0).treasuryAddress,
        reason: `amount must be at least $${this.config.minTopupUsd.toFixed(2)}`
      });
    }

    if (input.amountUsd > this.config.maxTopupUsd) {
      return failedTopup({
        input,
        wallet,
        parentWallet,
        hierarchy,
        requestStore: this.requestStore,
        treasuryAddress: this.treasury.allocateForUsd(0).treasuryAddress,
        reason: `amount must be at most $${this.config.maxTopupUsd.toFixed(2)}`
      });
    }

    if (this.requestStore.getTodaysCount(input.walletId) >= this.config.maxTopupsPerDay) {
      return failedTopup({
        input,
        wallet,
        parentWallet,
        hierarchy,
        requestStore: this.requestStore,
        treasuryAddress: this.treasury.allocateForUsd(0).treasuryAddress,
        reason: "top-up count exceeds maxTopupsPerDay"
      });
    }

    if (this.requestStore.getTodaysTotalUsd(input.walletId) + input.amountUsd > this.config.maxTopupPerDayUsd) {
      return failedTopup({
        input,
        wallet,
        parentWallet,
        hierarchy,
        requestStore: this.requestStore,
        treasuryAddress: this.treasury.allocateForUsd(0).treasuryAddress,
        reason: "top-up total exceeds maxTopupPerDayUsd"
      });
    }

    const charge = chargeMockCard(input);
    if (!charge.ok) {
      return failedTopup({
        input,
        wallet,
        parentWallet,
        hierarchy,
        requestStore: this.requestStore,
        treasuryAddress: this.treasury.allocateForUsd(0).treasuryAddress,
        reason: charge.reason
      });
    }

    const pending = this.requestStore.create({
      walletId: input.walletId,
      parentWalletId: hierarchy.parentWalletId,
      childWalletId: hierarchy.childWalletId,
      source: "mock-card",
      cardLast4: charge.cardLast4,
      requestedUsd: input.amountUsd,
      status: "pending"
    });

    const treasuryAllocation = this.treasury.allocateForUsd(input.amountUsd);
    const completed = this.requestStore.update(pending.id, (request) => ({
      ...request,
      status: "funded",
      fundedAt: new Date().toISOString(),
      txHash: treasuryAllocation.txHash
    }));

    const credited = this.walletManager.creditToParentAndAllocate({
      childWalletId: input.walletId,
      amountUsd: input.amountUsd,
      amountEth: treasuryAllocation.amountEth,
      sourceRef: completed.id,
      txHash: treasuryAllocation.txHash
    });

    return {
      ok: true,
      fundingRequest: completed,
      wallet: credited.childWallet,
      parentWallet: credited.parentWallet,
      hierarchy: this.walletManager.getHierarchy(input.walletId),
      treasury: treasuryAllocation
    };
  }
}

function failedTopup(input: {
  input: TopUpInput;
  wallet: WalletState;
  parentWallet: WalletState;
  hierarchy: WalletHierarchy;
  requestStore: FundingRequestStore;
  treasuryAddress: string;
  reason: string;
}): TopUpResult {
  const fundingRequest = input.requestStore.create({
    walletId: input.input.walletId,
    parentWalletId: input.hierarchy.parentWalletId,
    childWalletId: input.hierarchy.childWalletId,
    source: "mock-card",
    cardLast4: input.input.cardNumber.replace(/\D/g, "").slice(-4),
    requestedUsd: input.input.amountUsd,
    status: "failed",
    reason: input.reason
  });

  return {
    ok: false,
    fundingRequest,
    wallet: input.wallet,
    parentWallet: input.parentWallet,
    hierarchy: input.hierarchy,
    treasury: {
      chain: "sepolia",
      treasuryAddress: input.treasuryAddress,
      amountEth: 0,
      txHash: "",
      swapMode: "demo"
    },
    reason: input.reason
  };
}

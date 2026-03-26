import { FundingConfig, FundingRequest, TopUpInput, WalletState } from "../../shared/src/types";
import { WalletBalanceManager } from "../../wallet/src/balanceManager";
import { chargeMockCard } from "./mockCard";
import { FundingRequestStore } from "./fundingRequests";
import { SepoliaTreasury } from "./treasury";

export class FundingService {
  constructor(
    private readonly walletManager: WalletBalanceManager,
    private readonly requestStore: FundingRequestStore,
    private readonly treasury = new SepoliaTreasury(),
    private readonly config: FundingConfig = {
      minTopupUsd: Number(process.env.MIN_TOPUP_USD ?? "0.05"),
      maxTopupUsd: Number(process.env.MAX_TOPUP_USD ?? "25.00"),
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

  topUp(input: TopUpInput): {
    ok: boolean;
    fundingRequest: FundingRequest;
    wallet: WalletState;
    treasury: {
      chain: "sepolia";
      treasuryAddress: string;
      amountEth: number;
      txHash: string;
      swapMode: "demo";
    };
    reason?: string;
  } {
    const wallet = this.walletManager.getWallet(input.walletId);

    if (input.amountUsd < this.config.minTopupUsd) {
      const fundingRequest = this.requestStore.create({
        walletId: input.walletId,
        source: "mock-card",
        cardLast4: input.cardNumber.replace(/\D/g, "").slice(-4),
        requestedUsd: input.amountUsd,
        status: "failed",
        reason: `amount must be at least $${this.config.minTopupUsd.toFixed(2)}`
      });

      return {
        ok: false,
        fundingRequest,
        wallet,
        treasury: {
          chain: "sepolia",
          treasuryAddress: this.treasury.allocateForUsd(0).treasuryAddress,
          amountEth: 0,
          txHash: "",
          swapMode: "demo"
        },
        reason: fundingRequest.reason
      };
    }

    if (input.amountUsd > this.config.maxTopupUsd) {
      const fundingRequest = this.requestStore.create({
        walletId: input.walletId,
        source: "mock-card",
        cardLast4: input.cardNumber.replace(/\D/g, "").slice(-4),
        requestedUsd: input.amountUsd,
        status: "failed",
        reason: `amount must be at most $${this.config.maxTopupUsd.toFixed(2)}`
      });

      return {
        ok: false,
        fundingRequest,
        wallet,
        treasury: {
          chain: "sepolia",
          treasuryAddress: this.treasury.allocateForUsd(0).treasuryAddress,
          amountEth: 0,
          txHash: "",
          swapMode: "demo"
        },
        reason: fundingRequest.reason
      };
    }

    const charge = chargeMockCard(input);
    if (!charge.ok) {
      const fundingRequest = this.requestStore.create({
        walletId: input.walletId,
        source: "mock-card",
        cardLast4: input.cardNumber.replace(/\D/g, "").slice(-4),
        requestedUsd: input.amountUsd,
        status: "failed",
        reason: charge.reason
      });

      return {
        ok: false,
        fundingRequest,
        wallet,
        treasury: {
          chain: "sepolia",
          treasuryAddress: this.treasury.allocateForUsd(0).treasuryAddress,
          amountEth: 0,
          txHash: "",
          swapMode: "demo"
        },
        reason: charge.reason
      };
    }

    const pending = this.requestStore.create({
      walletId: input.walletId,
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

    const credited = this.walletManager.credit({
      walletId: input.walletId,
      amountUsd: input.amountUsd,
      amountEth: treasuryAllocation.amountEth,
      sourceRef: completed.id,
      txHash: treasuryAllocation.txHash
    });

    return {
      ok: true,
      fundingRequest: completed,
      wallet: credited.wallet,
      treasury: treasuryAllocation
    };
  }
}

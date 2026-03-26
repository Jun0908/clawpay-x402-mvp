import { randomBytes } from "node:crypto";
import { WalletLedgerEntry, WalletState } from "../../shared/src/types";
import { WalletStore } from "./store";

export type DebitResult =
  | {
      ok: true;
      wallet: WalletState;
      ledgerEntry: WalletLedgerEntry;
      txHash: string;
    }
  | {
      ok: false;
      reason: string;
      wallet: WalletState;
    };

export class WalletBalanceManager {
  constructor(private readonly store: WalletStore) {}

  getWallet(walletId: string): WalletState {
    return this.store.getOrCreate(walletId);
  }

  getLedger(walletId?: string): WalletLedgerEntry[] {
    return this.store.getLedger(walletId);
  }

  credit(input: {
    walletId: string;
    amountUsd: number;
    amountEth: number;
    sourceRef: string;
    txHash: string;
  }): { wallet: WalletState; topupEntry: WalletLedgerEntry; swapEntry: WalletLedgerEntry } {
    const wallet = this.store.update(input.walletId, (current) => ({
      ...current,
      availableUsd: current.availableUsd + input.amountUsd,
      pendingUsd: 0,
      lastFundedAt: new Date().toISOString()
    }));

    const topupEntry = this.store.appendLedger({
      walletId: input.walletId,
      action: "topup",
      amountUsd: input.amountUsd,
      amountEth: input.amountEth,
      status: "completed",
      sourceRef: input.sourceRef,
      txHash: input.txHash,
      reason: "mock card top-up captured and assigned to Sepolia treasury"
    });

    const swapEntry = this.store.appendLedger({
      walletId: input.walletId,
      action: "swap",
      amountUsd: input.amountUsd,
      amountEth: input.amountEth,
      status: "completed",
      sourceRef: input.sourceRef,
      txHash: input.txHash,
      reason: "demo ETH to USDC conversion completed on Sepolia hybrid mode"
    });

    return { wallet, topupEntry, swapEntry };
  }

  debit(input: {
    walletId: string;
    amountUsd: number;
    sourceRef: string;
    reason: string;
  }): DebitResult {
    const wallet = this.store.getOrCreate(input.walletId);

    if (wallet.availableUsd < input.amountUsd) {
      return {
        ok: false,
        reason: "insufficient funded balance",
        wallet
      };
    }

    const txHash = `0x${randomBytes(32).toString("hex")}`;
    const updatedWallet = this.store.update(input.walletId, (current) => ({
      ...current,
      availableUsd: current.availableUsd - input.amountUsd,
      spentUsd: current.spentUsd + input.amountUsd
    }));

    const ledgerEntry = this.store.appendLedger({
      walletId: input.walletId,
      action: "debit",
      amountUsd: input.amountUsd,
      status: "completed",
      sourceRef: input.sourceRef,
      txHash,
      reason: input.reason
    });

    return {
      ok: true,
      wallet: updatedWallet,
      ledgerEntry,
      txHash
    };
  }

  refund(input: {
    walletId: string;
    amountUsd: number;
    sourceRef: string;
    reason: string;
  }): { wallet: WalletState; ledgerEntry: WalletLedgerEntry } {
    const wallet = this.store.update(input.walletId, (current) => ({
      ...current,
      availableUsd: current.availableUsd + input.amountUsd,
      spentUsd: Math.max(current.spentUsd - input.amountUsd, 0)
    }));

    const ledgerEntry = this.store.appendLedger({
      walletId: input.walletId,
      action: "refund",
      amountUsd: input.amountUsd,
      status: "completed",
      sourceRef: input.sourceRef,
      reason: input.reason
    });

    return { wallet, ledgerEntry };
  }

  reset(): void {
    this.store.reset();
  }
}

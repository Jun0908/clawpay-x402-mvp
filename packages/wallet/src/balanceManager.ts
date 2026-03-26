import { randomBytes } from "node:crypto";
import { WalletHierarchy, WalletLedgerEntry, WalletState } from "../../shared/src/types";
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
    const hierarchy = this.store.ensureHierarchy(walletId);
    return this.store.getOrCreate(hierarchy.childWalletId, "child", hierarchy.parentWalletId);
  }

  getParentWallet(childWalletId: string): WalletState {
    const hierarchy = this.store.ensureHierarchy(childWalletId);
    return this.store.getOrCreate(hierarchy.parentWalletId, "parent");
  }

  getHierarchy(childWalletId: string): WalletHierarchy {
    const hierarchy = this.store.ensureHierarchy(childWalletId);
    const child = this.store.getOrCreate(hierarchy.childWalletId, "child", hierarchy.parentWalletId);
    return {
      ...hierarchy,
      allocatedUsd: child.availableUsd
    };
  }

  getLedger(walletId?: string): WalletLedgerEntry[] {
    return this.store.getLedger(walletId);
  }

  creditToParentAndAllocate(input: {
    childWalletId: string;
    amountUsd: number;
    amountEth: number;
    sourceRef: string;
    txHash: string;
  }): {
    parentWallet: WalletState;
    childWallet: WalletState;
    topupEntry: WalletLedgerEntry;
    allocationEntry: WalletLedgerEntry;
    swapEntry: WalletLedgerEntry;
  } {
    const hierarchy = this.store.ensureHierarchy(input.childWalletId);

    const parentWallet = this.store.update(hierarchy.parentWalletId, (current) => ({
      ...current,
      role: "parent",
      availableUsd: current.availableUsd + input.amountUsd,
      lastFundedAt: new Date().toISOString()
    }));

    const topupEntry = this.store.appendLedger({
      walletId: hierarchy.parentWalletId,
      action: "topup",
      amountUsd: input.amountUsd,
      amountEth: input.amountEth,
      status: "completed",
      sourceRef: input.sourceRef,
      txHash: input.txHash,
      reason: "mock card top-up captured into parent wallet",
      relatedWalletId: hierarchy.childWalletId
    });

    const swapEntry = this.store.appendLedger({
      walletId: hierarchy.parentWalletId,
      action: "swap",
      amountUsd: input.amountUsd,
      amountEth: input.amountEth,
      status: "completed",
      sourceRef: input.sourceRef,
      txHash: input.txHash,
      reason: "demo ETH to USDC conversion completed on Sepolia hybrid mode",
      relatedWalletId: hierarchy.childWalletId
    });

    const reducedParentWallet = this.store.update(hierarchy.parentWalletId, (current) => ({
      ...current,
      role: "parent",
      availableUsd: current.availableUsd - input.amountUsd,
      allocatedUsd: current.allocatedUsd + input.amountUsd,
      lastFundedAt: new Date().toISOString()
    }));

    const childWallet = this.store.update(hierarchy.childWalletId, (current) => ({
      ...current,
      role: "child",
      parentWalletId: hierarchy.parentWalletId,
      availableUsd: current.availableUsd + input.amountUsd,
      allocatedUsd: current.allocatedUsd + input.amountUsd,
      lastFundedAt: new Date().toISOString()
    }));

    const allocationEntry = this.store.appendLedger({
      walletId: hierarchy.parentWalletId,
      action: "allocation",
      amountUsd: input.amountUsd,
      status: "completed",
      sourceRef: input.sourceRef,
      txHash: input.txHash,
      reason: "parent wallet allocated funds to child agent wallet",
      relatedWalletId: hierarchy.childWalletId
    });

    return {
      parentWallet: reducedParentWallet,
      childWallet,
      topupEntry,
      allocationEntry,
      swapEntry
    };
  }

  debit(input: {
    walletId: string;
    amountUsd: number;
    sourceRef: string;
    reason: string;
  }): DebitResult {
    const hierarchy = this.store.ensureHierarchy(input.walletId);
    const wallet = this.store.getOrCreate(hierarchy.childWalletId, "child", hierarchy.parentWalletId);

    if (wallet.role !== "child") {
      return {
        ok: false,
        reason: "only child wallet can spend",
        wallet
      };
    }

    if (wallet.availableUsd < input.amountUsd) {
      return {
        ok: false,
        reason: "insufficient funded balance",
        wallet
      };
    }

    const txHash = `0x${randomBytes(32).toString("hex")}`;
    const updatedWallet = this.store.update(hierarchy.childWalletId, (current) => ({
      ...current,
      role: "child",
      parentWalletId: hierarchy.parentWalletId,
      availableUsd: current.availableUsd - input.amountUsd,
      spentUsd: current.spentUsd + input.amountUsd
    }));

    const ledgerEntry = this.store.appendLedger({
      walletId: hierarchy.childWalletId,
      action: "debit",
      amountUsd: input.amountUsd,
      status: "completed",
      sourceRef: input.sourceRef,
      txHash,
      reason: input.reason,
      relatedWalletId: hierarchy.parentWalletId
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
    const hierarchy = this.store.ensureHierarchy(input.walletId);
    const wallet = this.store.update(hierarchy.childWalletId, (current) => ({
      ...current,
      role: "child",
      parentWalletId: hierarchy.parentWalletId,
      availableUsd: current.availableUsd + input.amountUsd,
      spentUsd: Math.max(current.spentUsd - input.amountUsd, 0)
    }));

    const ledgerEntry = this.store.appendLedger({
      walletId: hierarchy.childWalletId,
      action: "refund",
      amountUsd: input.amountUsd,
      status: "completed",
      sourceRef: input.sourceRef,
      reason: input.reason,
      relatedWalletId: hierarchy.parentWalletId
    });

    return { wallet, ledgerEntry };
  }

  reset(): void {
    this.store.reset();
  }
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { WalletHierarchy, WalletLedgerEntry, WalletState } from "../../shared/src/types";

const walletStatePath = path.resolve(process.cwd(), "data", "wallet-state.json");
const walletLedgerPath = path.resolve(process.cwd(), "data", "wallet-ledger.json");

export class WalletStore {
  constructor(
    private readonly statePath = walletStatePath,
    private readonly ledgerPath = walletLedgerPath
  ) {
    ensureJsonFile(this.statePath);
    ensureJsonFile(this.ledgerPath);
  }

  getOrCreate(walletId: string, role: "parent" | "child" = "child", parentWalletId?: string): WalletState {
    const wallets = this.readStates();
    const existing = wallets.find((wallet) => wallet.walletId === walletId);
    if (existing) {
      return existing;
    }

    const created: WalletState = {
      walletId,
      role,
      parentWalletId,
      chain: "sepolia",
      address: `0x${randomBytes(20).toString("hex")}`,
      assetSymbol: "USDC",
      availableUsd: 0,
      pendingUsd: 0,
      spentUsd: 0,
      allocatedUsd: 0
    };

    wallets.push(created);
    this.writeStates(wallets);
    return created;
  }

  ensureHierarchy(childWalletId: string): WalletHierarchy {
    const parentWalletId = `parent:${childWalletId}`;
    this.getOrCreate(parentWalletId, "parent");
    this.getOrCreate(childWalletId, "child", parentWalletId);

    const child = this.getOrCreate(childWalletId, "child", parentWalletId);
    return {
      parentWalletId,
      childWalletId: child.walletId,
      allocatedUsd: child.availableUsd
    };
  }

  get(walletId: string): WalletState | undefined {
    return this.readStates().find((wallet) => wallet.walletId === walletId);
  }

  update(walletId: string, updater: (wallet: WalletState) => WalletState): WalletState {
    const wallets = this.readStates();
    const index = wallets.findIndex((wallet) => wallet.walletId === walletId);
    const current = index >= 0 ? wallets[index] : this.getOrCreate(walletId);
    const next = sanitizeWallet(updater(current));

    if (index >= 0) {
      wallets[index] = next;
    } else {
      wallets.push(next);
    }

    this.writeStates(wallets);
    return next;
  }

  appendLedger(entry: Omit<WalletLedgerEntry, "id" | "timestamp">): WalletLedgerEntry {
    const entries = this.readLedger();
    const next: WalletLedgerEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry
    };
    entries.push(next);
    writeFileSync(this.ledgerPath, JSON.stringify(entries, null, 2));
    return next;
  }

  getLedger(walletId?: string): WalletLedgerEntry[] {
    const entries = this.readLedger();
    return walletId
      ? entries.filter((entry) => entry.walletId === walletId || entry.relatedWalletId === walletId)
      : entries;
  }

  reset(): void {
    writeFileSync(this.statePath, "[]\n");
    writeFileSync(this.ledgerPath, "[]\n");
  }

  private readStates(): WalletState[] {
    ensureJsonFile(this.statePath);
    return JSON.parse(readFileSync(this.statePath, "utf8")) as WalletState[];
  }

  private writeStates(wallets: WalletState[]): void {
    writeFileSync(this.statePath, JSON.stringify(wallets.map(sanitizeWallet), null, 2));
  }

  private readLedger(): WalletLedgerEntry[] {
    ensureJsonFile(this.ledgerPath);
    return JSON.parse(readFileSync(this.ledgerPath, "utf8")) as WalletLedgerEntry[];
  }
}

function sanitizeWallet(wallet: WalletState): WalletState {
  return {
    ...wallet,
    availableUsd: roundUsd(wallet.availableUsd),
    pendingUsd: roundUsd(wallet.pendingUsd),
    spentUsd: roundUsd(wallet.spentUsd),
    allocatedUsd: roundUsd(wallet.allocatedUsd)
  };
}

function ensureJsonFile(filePath: string): void {
  const dir = path.dirname(filePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (!existsSync(filePath)) {
    writeFileSync(filePath, "[]\n");
  }
}

function roundUsd(value: number): number {
  return Number(value.toFixed(2));
}

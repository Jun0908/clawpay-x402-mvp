import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FundingRequest } from "../../shared/src/types";
import { getRuntimeDataDir } from "../../shared/src/runtimePaths";

const fundingRequestsPath = path.join(getRuntimeDataDir(), "funding-requests.json");

export class FundingRequestStore {
  constructor(private readonly filePath = fundingRequestsPath) {
    ensureFile(this.filePath);
  }

  create(entry: Omit<FundingRequest, "id" | "createdAt">): FundingRequest {
    const items = this.readAll();
    const next: FundingRequest = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...entry
    };
    items.push(next);
    this.writeAll(items);
    return next;
  }

  update(requestId: string, updater: (request: FundingRequest) => FundingRequest): FundingRequest {
    const items = this.readAll();
    const index = items.findIndex((item) => item.id === requestId);
    if (index < 0) {
      throw new Error(`Unknown funding request: ${requestId}`);
    }

    const next = updater(items[index]);
    items[index] = next;
    this.writeAll(items);
    return next;
  }

  getByWallet(walletId?: string): FundingRequest[] {
    const items = this.readAll();
    return walletId ? items.filter((item) => item.walletId === walletId) : items;
  }

  getTodaysCount(walletId: string, date = new Date()): number {
    const prefix = date.toISOString().slice(0, 10);
    return this.getByWallet(walletId).filter((item) => item.createdAt.startsWith(prefix)).length;
  }

  getTodaysTotalUsd(walletId: string, date = new Date()): number {
    const prefix = date.toISOString().slice(0, 10);
    return this.getByWallet(walletId)
      .filter((item) => item.createdAt.startsWith(prefix) && item.status !== "failed")
      .reduce((total, item) => total + item.requestedUsd, 0);
  }

  reset(): void {
    writeFileSync(this.filePath, "[]\n");
  }

  private readAll(): FundingRequest[] {
    ensureFile(this.filePath);
    return readJsonArray<FundingRequest>(this.filePath);
  }

  private writeAll(items: FundingRequest[]): void {
    writeFileSync(this.filePath, JSON.stringify(items, null, 2));
  }
}

function ensureFile(filePath: string): void {
  const dir = path.dirname(filePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (!existsSync(filePath)) {
    writeFileSync(filePath, "[]\n");
  }
}

function readJsonArray<T>(filePath: string): T[] {
  const raw = readFileSync(filePath, "utf8").trim();

  if (!raw) {
    writeFileSync(filePath, "[]\n");
    return [];
  }

  try {
    return JSON.parse(raw) as T[];
  } catch {
    writeFileSync(filePath, "[]\n");
    return [];
  }
}

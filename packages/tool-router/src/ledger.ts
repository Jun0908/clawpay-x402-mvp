import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SpendLog, SpendSummary } from "../../shared/src/types";
import { getRuntimeDataDir } from "../../shared/src/runtimePaths";

const DEFAULT_LEDGER_PATH = path.join(getRuntimeDataDir(), "spend-ledger.json");

export class SpendLedger {
  constructor(private readonly ledgerPath = DEFAULT_LEDGER_PATH) {
    ensureLedgerFile(this.ledgerPath);
  }

  readAll(): SpendLog[] {
    ensureLedgerFile(this.ledgerPath);
    return readJsonArray<SpendLog>(this.ledgerPath);
  }

  append(entry: Omit<SpendLog, "id" | "timestamp">): SpendLog {
    const logs = this.readAll();
    const log: SpendLog = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry
    };
    logs.push(log);
    writeFileSync(this.ledgerPath, JSON.stringify(logs, null, 2));
    return log;
  }

  getSessionLogs(sessionId: string): SpendLog[] {
    return this.readAll().filter((entry) => entry.sessionId === sessionId);
  }

  getSessionSummary(sessionId: string): SpendSummary {
    const sessionLogs = this.getSessionLogs(sessionId);

    return {
      totalSpentUsd: roundUsd(
        sessionLogs.reduce((total, entry) => total + (entry.action === "paid" ? entry.approvedUsd : 0), 0)
      ),
      callsPaid: sessionLogs.filter((entry) => entry.action === "paid").length,
      callsBlocked: sessionLogs.filter(
        (entry) => entry.action === "blocked" || entry.action === "approval_required"
      ).length
    };
  }

  getDayLogs(date = new Date()): SpendLog[] {
    const prefix = isoDate(date);
    return this.readAll().filter((entry) => entry.timestamp.startsWith(prefix));
  }

  getDaySpendUsd(date = new Date()): number {
    return roundUsd(
      this.getDayLogs(date).reduce((total, entry) => total + (entry.action === "paid" ? entry.approvedUsd : 0), 0)
    );
  }

  getSessionProviderPaidCount(sessionId: string, providerId: string): number {
    return this.getSessionLogs(sessionId).filter(
      (entry) => entry.providerId === providerId && entry.action === "paid"
    ).length;
  }

  getSessionRequestPaidCount(sessionId: string, requestSummary: string): number {
    return this.getSessionLogs(sessionId).filter(
      (entry) => entry.requestSummary === requestSummary && entry.action === "paid"
    ).length;
  }

  clear(): void {
    writeFileSync(this.ledgerPath, "[]\n");
  }
}

function ensureLedgerFile(filePath: string): void {
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

function roundUsd(value: number): number {
  return Number(value.toFixed(2));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

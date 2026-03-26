import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SpendLog, SpendSummary } from "../../shared/src/types";

const DEFAULT_LEDGER_PATH = path.resolve(process.cwd(), "data", "spend-ledger.json");

export class SpendLedger {
  constructor(private readonly ledgerPath = DEFAULT_LEDGER_PATH) {
    ensureLedgerFile(this.ledgerPath);
  }

  readAll(): SpendLog[] {
    ensureLedgerFile(this.ledgerPath);
    const raw = readFileSync(this.ledgerPath, "utf8");
    return JSON.parse(raw) as SpendLog[];
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
      callsBlocked: sessionLogs.filter((entry) => entry.action === "blocked").length
    };
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

function roundUsd(value: number): number {
  return Number(value.toFixed(2));
}

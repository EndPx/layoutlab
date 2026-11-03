// Durable public-inference budget guard (v3-M8): a persistent US$ allowance
// with full-run reservations. The allowance never refills automatically.
// Every state change is written atomically (temp file + rename) BEFORE the
// caller proceeds, and any persistence failure is fail-closed: the caller
// must not spend. Amounts are tracked in integer micro-USD to avoid float
// drift across restarts.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

export type BudgetEntryState = "reserved" | "committed" | "released";

export type BudgetEntry = {
  id: string;
  reservedMicroUsd: number;
  committedMicroUsd: number | null;
  state: BudgetEntryState;
  createdAtMs: number;
};

export type BudgetSnapshot = {
  capMicroUsd: number;
  reservedMicroUsd: number;
  committedMicroUsd: number;
  availableMicroUsd: number;
  entries: BudgetEntry[];
};

type BudgetFile = { version: 1; entries: BudgetEntry[] };

export class BudgetGuardError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const toMicro = (usd: number): number => {
  if (!Number.isFinite(usd) || usd < 0) {
    throw new BudgetGuardError("BUDGET_BAD_AMOUNT", 400, "amount must be a finite non-negative USD value");
  }
  return Math.round(usd * 1_000_000);
};

export function createBudgetGuard(opts: { filePath: string; capUsd: number }) {
  const capMicroUsd = toMicro(opts.capUsd);
  if (capMicroUsd <= 0) {
    throw new BudgetGuardError("BUDGET_BAD_CAP", 500, "budget cap must be positive");
  }
  const load = (): BudgetFile => {
    if (!existsSync(opts.filePath)) return { version: 1, entries: [] };
    let raw: string;
    try {
      raw = readFileSync(opts.filePath, "utf8");
    } catch {
      throw new BudgetGuardError("BUDGET_GUARD_UNAVAILABLE", 503, "budget state cannot be read; refusing to spend");
    }
    try {
      const parsed = JSON.parse(raw) as BudgetFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.entries)) throw new Error("shape");
      return parsed;
    } catch {
      throw new BudgetGuardError("BUDGET_GUARD_UNAVAILABLE", 503, "budget state is corrupt; refusing to spend");
    }
  };
  const save = (state: BudgetFile): void => {
    const tmp = `${opts.filePath}.tmp-${process.pid}`;
    try {
      writeFileSync(tmp, JSON.stringify(state, null, 1), "utf8");
      renameSync(tmp, opts.filePath);
    } catch {
      throw new BudgetGuardError("BUDGET_GUARD_UNAVAILABLE", 503, "budget state cannot be persisted; refusing to spend");
    }
  };
  const totals = (state: BudgetFile): { reserved: number; committed: number } => {
    let reserved = 0;
    let committed = 0;
    for (const e of state.entries) {
      if (e.state === "reserved") reserved += e.reservedMicroUsd;
      if (e.state === "committed") committed += e.committedMicroUsd ?? e.reservedMicroUsd;
    }
    return { reserved, committed };
  };
  return {
    snapshot(): BudgetSnapshot {
      const state = load();
      const { reserved, committed } = totals(state);
      return {
        capMicroUsd,
        reservedMicroUsd: reserved,
        committedMicroUsd: committed,
        availableMicroUsd: capMicroUsd - reserved - committed,
        entries: state.entries.map((e) => ({ ...e })),
      };
    },
    reserve(id: string, usd: number): BudgetEntry {
      const amount = toMicro(usd);
      const state = load();
      const existing = state.entries.find((e) => e.id === id);
      if (existing) {
        if (existing.state === "reserved" && existing.reservedMicroUsd === amount) {
          return { ...existing };
        }
        throw new BudgetGuardError("BUDGET_DUPLICATE", 409, `budget entry ${id} already exists`);
      }
      const { reserved, committed } = totals(state);
      if (reserved + committed + amount > capMicroUsd) {
        throw new BudgetGuardError(
          "BUDGET_EXCEEDED",
          402,
          `reservation of $${usd} exceeds the remaining public allowance`,
        );
      }
      const entry: BudgetEntry = {
        id,
        reservedMicroUsd: amount,
        committedMicroUsd: null,
        state: "reserved",
        createdAtMs: Date.now(),
      };
      state.entries.push(entry);
      save(state);
      return { ...entry };
    },
    commit(id: string, usd?: number): BudgetEntry {
      const state = load();
      const entry = state.entries.find((e) => e.id === id);
      if (!entry || entry.state !== "reserved") {
        throw new BudgetGuardError("BUDGET_UNKNOWN_RESERVATION", 409, `no open reservation ${id}`);
      }
      entry.committedMicroUsd = usd === undefined ? entry.reservedMicroUsd : toMicro(usd);
      if (entry.committedMicroUsd > entry.reservedMicroUsd) {
        throw new BudgetGuardError("BUDGET_BAD_AMOUNT", 400, "commit exceeds its reservation");
      }
      entry.state = "committed";
      save(state);
      return { ...entry };
    },
    release(id: string): BudgetEntry {
      const state = load();
      const entry = state.entries.find((e) => e.id === id);
      if (!entry || entry.state !== "reserved") {
        throw new BudgetGuardError("BUDGET_UNKNOWN_RESERVATION", 409, `no open reservation ${id}`);
      }
      entry.state = "released";
      save(state);
      return { ...entry };
    },
  };
}

export type BudgetGuard = ReturnType<typeof createBudgetGuard>;

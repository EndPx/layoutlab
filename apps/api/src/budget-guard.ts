// Durable public-inference budget guard (v3-M8, corrected): a persistent
// US$ allowance with full-run reservations. The allowance never refills
// automatically. A ledger exists only after explicit admin initialization
// (or explicit v1 migration); a configured-but-missing/corrupt ledger is
// fail-closed, never silently recreated. Every mutation holds a native
// exclusive lock file, validates the whole ledger strictly, and persists
// atomically (temp file + fsync + rename) BEFORE the caller proceeds.
// Amounts are integer micro-USD. `reserved` is a conservative bound held;
// `committed` is that bound charged after dispatch (not an invoice).
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

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

type BudgetFileV2 = { version: 2; capMicroUsd: number; entries: BudgetEntry[] };
type BudgetFileV1 = { version: 1; entries: BudgetEntry[] };

export class BudgetGuardError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const MAX_ENTRIES = 10_000;
const MAX_FILE_BYTES = 8_388_608;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_MS = 15;
// shortcut: stale locks are never auto-removed (a crashed holder is
// indistinguishable from a slow one); recovery is manual, see review doc.
const ENTRY_KEYS = ["committedMicroUsd", "createdAtMs", "id", "reservedMicroUsd", "state"];

function unavailable(message: string): BudgetGuardError {
  return new BudgetGuardError("BUDGET_GUARD_UNAVAILABLE", 503, message);
}
function invalidLedger(detail: string): BudgetGuardError {
  return unavailable(`budget ledger is invalid (${detail}); refusing to spend`);
}

function toMicro(usd: number, allowZero: boolean): number {
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0 || (!allowZero && usd === 0)) {
    throw new BudgetGuardError("BUDGET_BAD_AMOUNT", 400, "amount must be a finite positive USD value");
  }
  const scaled = usd * 1_000_000;
  const micro = Math.round(scaled);
  if (!Number.isSafeInteger(micro) || Math.abs(scaled - micro) > 1e-3 || (micro === 0 && usd !== 0)) {
    throw new BudgetGuardError("BUDGET_BAD_AMOUNT", 400, "amount must resolve to whole micro-USD");
  }
  return micro;
}
function capToMicro(capUsd: number): number {
  const cap = toMicro(capUsd, false);
  if (cap <= 0) throw new BudgetGuardError("BUDGET_BAD_CAP", 500, "budget cap must be positive");
  return cap;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function hasExactKeys(obj: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(obj).sort();
  return actual.length === keys.length && actual.every((k, i) => k === keys[i]);
}
function isMicro(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v);
}

function validateEntry(raw: unknown, capMicroUsd: number): BudgetEntry {
  if (!isRecord(raw) || !hasExactKeys(raw, ENTRY_KEYS)) throw invalidLedger("entry shape");
  const { id, reservedMicroUsd, committedMicroUsd, state, createdAtMs } = raw;
  if (typeof id !== "string" || id.length === 0 || id.length > 256 || id.includes("\0")) {
    throw invalidLedger("entry id");
  }
  if (!isMicro(reservedMicroUsd) || reservedMicroUsd <= 0 || reservedMicroUsd > capMicroUsd) {
    throw invalidLedger("reservedMicroUsd out of range");
  }
  if (state !== "reserved" && state !== "committed" && state !== "released") {
    throw invalidLedger("entry state");
  }
  if (state === "committed") {
    if (!isMicro(committedMicroUsd) || committedMicroUsd < 0 || committedMicroUsd > reservedMicroUsd) {
      throw invalidLedger("committedMicroUsd inconsistent with reservation");
    }
  } else if (committedMicroUsd !== null) {
    throw invalidLedger("committedMicroUsd must be null unless committed");
  }
  if (!isMicro(createdAtMs) || createdAtMs < 0 || createdAtMs > 253_402_300_799_999) {
    throw invalidLedger("createdAtMs out of range");
  }
  return { id, reservedMicroUsd, committedMicroUsd: committedMicroUsd as number | null, state, createdAtMs };
}

function totalsOf(entries: BudgetEntry[], capMicroUsd: number): { reserved: number; committed: number } {
  const seen = new Set<string>();
  let reserved = 0;
  let committed = 0;
  for (const e of entries) {
    if (seen.has(e.id)) throw invalidLedger(`duplicate entry id ${e.id}`);
    seen.add(e.id);
    if (e.state === "reserved") reserved += e.reservedMicroUsd;
    if (e.state === "committed") committed += e.committedMicroUsd ?? e.reservedMicroUsd;
    if (!Number.isSafeInteger(reserved) || !Number.isSafeInteger(committed)) {
      throw invalidLedger("totals overflow");
    }
  }
  if (reserved + committed > capMicroUsd) throw invalidLedger("totals exceed cap");
  return { reserved, committed };
}

function validateEntries(raw: unknown, capMicroUsd: number): BudgetEntry[] {
  if (!Array.isArray(raw) || raw.length > MAX_ENTRIES) throw invalidLedger("entries bound");
  const entries = raw.map((e) => validateEntry(e, capMicroUsd));
  totalsOf(entries, capMicroUsd);
  return entries;
}

function readRaw(filePath: string): string {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw unavailable(
        "budget ledger is missing; run explicit initialization (budget-admin init) - refusing to spend, no allowance was recreated",
      );
    }
    throw unavailable("budget state cannot be read; refusing to spend");
  }
  if (raw.length > MAX_FILE_BYTES) throw invalidLedger("file too large");
  return raw;
}

function parseV2(raw: string, expectedCapMicroUsd: number): BudgetFileV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw unavailable("budget state is corrupt; refusing to spend");
  }
  if (!isRecord(parsed)) throw invalidLedger("file shape");
  if (parsed["version"] === 1) {
    throw new BudgetGuardError(
      "BUDGET_MIGRATION_REQUIRED",
      503,
      "budget ledger is version 1; run explicit migration (budget-admin migrate) preserving cap/entries - refusing to spend",
    );
  }
  if (parsed["version"] !== 2 || !hasExactKeys(parsed, ["capMicroUsd", "entries", "version"])) {
    throw invalidLedger("file shape/version");
  }
  const capMicroUsd = parsed["capMicroUsd"];
  if (!isMicro(capMicroUsd) || capMicroUsd <= 0) throw invalidLedger("capMicroUsd");
  if (capMicroUsd !== expectedCapMicroUsd) {
    throw new BudgetGuardError(
      "BUDGET_CAP_MISMATCH",
      503,
      "configured budget cap does not match the persisted ledger cap; refusing to spend (no silent refill or reduction)",
    );
  }
  return { version: 2, capMicroUsd, entries: validateEntries(parsed["entries"], capMicroUsd) };
}

function parseV1ForMigration(raw: string, capMicroUsd: number): BudgetEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw unavailable("budget state is corrupt; migration refused, ledger unchanged");
  }
  if (!isRecord(parsed) || parsed["version"] !== 1 || !hasExactKeys(parsed, ["entries", "version"])) {
    throw invalidLedger("version-1 file shape");
  }
  return validateEntries(parsed["entries"], capMicroUsd);
}

function sleepMs(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      // fallback busy-wait for runtimes without Atomics.wait on main thread
    }
  }
}

// Native exclusive lock: lock file created with `wx`. Never auto-removed
// when stale - contention past the timeout is fail-closed.
function acquireLock(filePath: string): () => void {
  const lockPath = `${filePath}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    let fd: number;
    try {
      fd = openSync(lockPath, "wx");
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        if (Date.now() >= deadline) {
          throw new BudgetGuardError(
            "BUDGET_GUARD_LOCKED",
            503,
            "budget ledger is locked by another process; refusing to spend. If no API process is running, remove the ledger's sibling .lock file manually - ledger entries and claims are preserved.",
          );
        }
        sleepMs(LOCK_RETRY_MS);
        continue;
      }
      throw unavailable("budget lock cannot be acquired; refusing to spend");
    }
    try {
      writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      fsyncSync(fd);
    } catch {
      try { closeSync(fd); } catch { /* ignore */ }
      try { unlinkSync(lockPath); } catch { /* ignore */ }
      throw unavailable("budget lock cannot be written; refusing to spend");
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      try { closeSync(fd); } catch { /* ignore */ }
      try { unlinkSync(lockPath); } catch { /* ignore */ }
    };
  }
}

function saveLocked(filePath: string, state: BudgetFileV2): void {
  const suffix = `${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const tmp = `${filePath}.tmp-${suffix}`;
  try {
    const fd = openSync(tmp, "w");
    try {
      writeFileSync(fd, JSON.stringify(state, null, 1), "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, filePath);
    // Best-effort directory fsync so the rename itself is durable.
    try {
      const dirFd = openSync(dirname(filePath) || ".", "r");
      try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
    } catch { /* unsupported on some platforms; rename remains atomic */ }
  } catch {
    try { unlinkSync(tmp); } catch { /* ignore */ }
    throw unavailable("budget state cannot be persisted; refusing to spend");
  }
}

function loadLocked(filePath: string, capMicroUsd: number): BudgetFileV2 {
  return parseV2(readRaw(filePath), capMicroUsd);
}

function snapshotOf(state: BudgetFileV2): BudgetSnapshot {
  const { reserved, committed } = totalsOf(state.entries, state.capMicroUsd);
  return {
    capMicroUsd: state.capMicroUsd,
    reservedMicroUsd: reserved,
    committedMicroUsd: committed,
    availableMicroUsd: state.capMicroUsd - reserved - committed,
    entries: state.entries.map((e) => ({ ...e })),
  };
}

/** Explicit admin initialization. Refuses to overwrite any existing ledger. */
export function initializeBudgetLedger(opts: { filePath: string; capUsd: number }): BudgetSnapshot {
  const capMicroUsd = capToMicro(opts.capUsd);
  if (existsSync(`${opts.filePath}.lock`)) {
    throw new BudgetGuardError("BUDGET_GUARD_LOCKED", 503, "budget lock file exists; initialization refused (see recovery instruction)");
  }
  const state: BudgetFileV2 = { version: 2, capMicroUsd, entries: [] };
  let fd: number;
  try {
    fd = openSync(opts.filePath, "wx");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new BudgetGuardError("BUDGET_ALREADY_EXISTS", 409, "budget ledger already exists; initialization refuses to overwrite it (no reset/refill)");
    }
    throw unavailable("budget ledger cannot be created; check the explicit path and permissions");
  }
  try {
    writeFileSync(fd, JSON.stringify(state, null, 1), "utf8");
    fsyncSync(fd);
  } catch {
    throw unavailable("budget ledger cannot be written during initialization");
  } finally {
    try { closeSync(fd); } catch { /* ignore */ }
  }
  return snapshotOf(state);
}

/** Explicit v1 -> v2 migration. Preserves every audited entry and order. */
export function migrateBudgetLedger(opts: { filePath: string; capUsd: number }): BudgetSnapshot {
  const capMicroUsd = capToMicro(opts.capUsd);
  const release = acquireLock(opts.filePath);
  try {
    const raw = readRaw(opts.filePath);
    let parsedVersion: unknown;
    try {
      parsedVersion = (JSON.parse(raw) as Record<string, unknown>)["version"];
    } catch {
      throw unavailable("budget state is corrupt; migration refused, ledger unchanged");
    }
    if (parsedVersion === 2) {
      return snapshotOf(parseV2(raw, capMicroUsd));
    }
    const entries = parseV1ForMigration(raw, capMicroUsd);
    const state: BudgetFileV2 = { version: 2, capMicroUsd, entries };
    saveLocked(opts.filePath, state);
    return snapshotOf(state);
  } finally {
    release();
  }
}

export function createBudgetGuard(opts: { filePath: string; capUsd: number }) {
  const capMicroUsd = capToMicro(opts.capUsd);
  const filePath = opts.filePath;
  const checkId = (id: string): void => {
    if (typeof id !== "string" || id.length === 0 || id.length > 256 || id.includes("\0")) {
      throw new BudgetGuardError("BUDGET_BAD_ID", 400, "reservation id must be a non-empty string");
    }
  };
  return {
    snapshot(): BudgetSnapshot {
      return snapshotOf(parseV2(readRaw(filePath), capMicroUsd));
    },
    // Durable authorization for the next dispatch: re-reads and strictly
    // validates the whole ledger (cap included), then requires this exact
    // claim to still be held at its original bound. Available may be 0 -
    // a fully held claim is authorized by its reservation, not by headroom.
    assertReservation(id: string, usd: number): BudgetEntry {
      checkId(id);
      const expected = toMicro(usd, false);
      const snap = snapshotOf(parseV2(readRaw(filePath), capMicroUsd));
      const entry = snap.entries.find((e) => e.id === id);
      if (!entry) {
        throw new BudgetGuardError("BUDGET_RESERVATION_MISSING", 503, `budget reservation ${id} is missing; refusing inference`);
      }
      if (entry.state !== "reserved") {
        throw new BudgetGuardError("BUDGET_RESERVATION_NOT_HELD", 503, `budget reservation ${id} is ${entry.state}, not reserved; refusing inference`);
      }
      if (entry.reservedMicroUsd < expected) {
        throw new BudgetGuardError("BUDGET_RESERVATION_INSUFFICIENT", 503, `budget reservation ${id} is below its original bound; refusing inference`);
      }
      return { ...entry };
    },
    reserve(id: string, usd: number): BudgetEntry {
      checkId(id);
      const amount = toMicro(usd, false);
      const release = acquireLock(filePath);
      try {
        const state = loadLocked(filePath, capMicroUsd);
        if (state.entries.some((e) => e.id === id)) {
          throw new BudgetGuardError(
            "BUDGET_DUPLICATE",
            409,
            `budget entry ${id} already exists; reservation ids are single-use and cannot fund another request`,
          );
        }
        if (state.entries.length >= MAX_ENTRIES) throw invalidLedger("entries bound");
        const { reserved, committed } = totalsOf(state.entries, capMicroUsd);
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
        saveLocked(filePath, state);
        return { ...entry };
      } finally {
        release();
      }
    },
    commit(id: string, usd?: number): BudgetEntry {
      checkId(id);
      const release = acquireLock(filePath);
      try {
        const state = loadLocked(filePath, capMicroUsd);
        const entry = state.entries.find((e) => e.id === id);
        if (!entry || entry.state !== "reserved") {
          throw new BudgetGuardError("BUDGET_UNKNOWN_RESERVATION", 409, `no open reservation ${id}`);
        }
        entry.committedMicroUsd = usd === undefined ? entry.reservedMicroUsd : toMicro(usd, true);
        if (entry.committedMicroUsd > entry.reservedMicroUsd) {
          throw new BudgetGuardError("BUDGET_BAD_AMOUNT", 400, "commit exceeds its reservation");
        }
        entry.state = "committed";
        saveLocked(filePath, state);
        return { ...entry };
      } finally {
        release();
      }
    },
    release(id: string): BudgetEntry {
      checkId(id);
      const releaseLock = acquireLock(filePath);
      try {
        const state = loadLocked(filePath, capMicroUsd);
        const entry = state.entries.find((e) => e.id === id);
        if (!entry || entry.state !== "reserved") {
          throw new BudgetGuardError("BUDGET_UNKNOWN_RESERVATION", 409, `no open reservation ${id}`);
        }
        entry.state = "released";
        saveLocked(filePath, state);
        return { ...entry };
      } finally {
        releaseLock();
      }
    },
  };
}

export type BudgetGuard = ReturnType<typeof createBudgetGuard>;

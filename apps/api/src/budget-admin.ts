// Offline admin helper for the public budget ledger. Explicit init/migrate
// only; there is deliberately no reset/refill command and no HTTP endpoint.
// Usage (after `npm run build --workspace @layoutlab/api`):
//   node apps/api/dist/budget-admin.js init    --file <ledger.json> --cap-usd 1
//   node apps/api/dist/budget-admin.js migrate --file <ledger.json> --cap-usd 1
// Prints only safe aggregates (cap/reserved/committed/available/entries).
import { BudgetGuardError, initializeBudgetLedger, migrateBudgetLedger } from "./budget-guard.js";

function parseArgs(argv: string[]): { command: string; file: string; capUsd: number } {
  const [command, ...rest] = argv;
  if (command !== "init" && command !== "migrate") {
    throw new Error("usage: budget-admin <init|migrate> --file <ledger.json> --cap-usd <usd>");
  }
  let file = "";
  let capRaw = "";
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (value === undefined || (key !== "--file" && key !== "--cap-usd")) {
      throw new Error("usage: budget-admin <init|migrate> --file <ledger.json> --cap-usd <usd>");
    }
    if (key === "--file") file = value;
    else capRaw = value;
  }
  const capUsd = Number(capRaw);
  if (file === "" || capRaw === "" || !Number.isFinite(capUsd) || capUsd <= 0) {
    throw new Error("usage: budget-admin <init|migrate> --file <ledger.json> --cap-usd <usd>");
  }
  return { command, file, capUsd };
}

function main(): void {
  try {
    const { command, file, capUsd } = parseArgs(process.argv.slice(2));
    const snap = command === "init"
      ? initializeBudgetLedger({ filePath: file, capUsd })
      : migrateBudgetLedger({ filePath: file, capUsd });
    console.log(JSON.stringify({
      ok: true,
      command,
      capUsd: snap.capMicroUsd / 1_000_000,
      reservedUsd: snap.reservedMicroUsd / 1_000_000,
      committedUsd: snap.committedMicroUsd / 1_000_000,
      availableUsd: snap.availableMicroUsd / 1_000_000,
      entries: snap.entries.length,
    }));
  } catch (e) {
    const code = e instanceof BudgetGuardError ? e.code : "BUDGET_ADMIN_ERROR";
    const message = e instanceof Error ? e.message : "budget admin failed";
    console.error(JSON.stringify({ ok: false, code, message }));
    process.exitCode = 1;
  }
}

main();

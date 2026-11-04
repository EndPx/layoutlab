import { readFileSync } from "node:fs";
import { once } from "node:events";
import { expect, it } from "vitest";
import { createApp } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { verifyInvestigationExport } from "../src/operations-investigations.js";

it("verifies archived evidence offline and rejects mixed/unknown versions over HTTP without a key", async () => {
  const report = JSON.parse(readFileSync(new URL("../../../evidence/sanitized/e4a-live-investigation-f24a6a1.json", import.meta.url), "utf8"));
  let calls = 0;
  const { app } = createApp({config: loadConfig({MODEL_API_KEY: "", BUDGET_STATE_FILE: ""}), fetchImpl: async () => { calls++; throw Error("unexpected provider call"); }});
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as import("node:net").AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const status = await (await fetch(`${base}/api/status`)).json() as { operationsImplementationVersion: string };
    expect(status.operationsImplementationVersion).toBe("0.1.1");
    const current = structuredClone(report);
    const relabel = (value: any): void => {
      if (!value || typeof value !== "object") return;
      if (value.versions?.simulation) value.versions.simulation = "0.1.1";
      Object.values(value).forEach(relabel);
    };
    // This preserved burst has identical metrics under both supported runtimes.
    // Verification still recomputes every result under the declared implementation.
    relabel(current);
    const mixedOuter = structuredClone(report);
    mixedOuter.versions.simulation = "0.1.1";
    const mixedComparison = structuredClone(report);
    mixedComparison.comparison.versions.simulation = "0.1.1";
    const mixedRun = structuredClone(report);
    const changeFirstRun = (value: any): boolean => {
      if (!value || typeof value !== "object") return false;
      if (value.schema === "layoutlab.operations-report/1") {
        value.versions.simulation = "0.1.1";
        return true;
      }
      return Object.values(value).some(changeFirstRun);
    };
    expect(changeFirstRun(mixedRun.comparison)).toBe(true);
    const unknown = structuredClone(report);
    unknown.versions.simulation = "unknown";
    const missingComparison = structuredClone(report);
    missingComparison.comparison = null;
    for (const [candidate, accepted, expectedVerifier] of [
      [report, true, "0.1.0"], [current, true, "0.1.1"],
      [mixedOuter, false, "0.1.0"], [mixedComparison, false, "0.1.1"],
      [mixedRun, false, "0.1.0"], [unknown, false, "0.1.0"],
      [missingComparison, false, null],
    ] as const) {
      const direct = verifyInvestigationExport(candidate);
      expect(direct.ok).toBe(accepted);
      expect(direct.verifierImplementationVersion).toBe(expectedVerifier);
      const response = await fetch(`${base}/api/operations/investigations/verify`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({report: candidate})});
      expect(response.status).toBe(200);
      const body = await response.json() as typeof direct;
      expect(body.ok).toBe(accepted);
      expect(body.verifierImplementationVersion).toBe(expectedVerifier);
      expect(body).toEqual(direct);
    }
    expect(calls).toBe(0);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}, 300000);

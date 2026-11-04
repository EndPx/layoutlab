// Compose the sanitized R3c old/new evidence file from verify-runtime
// output files (given as argv in baseline/archived/current order).
import fs from "node:fs";

const [a, b, c, out] = process.argv.slice(2);
const read = (p) => {
  const buf = fs.readFileSync(p);
  const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString("utf16le") : buf.toString("utf8");
  return JSON.parse(text.replace(/^\uFEFF/, ""));
};
const slim = (j) => ({
  implementation: j.full.implementation,
  fullShift: {
    stage: j.full.stage,
    counts: j.full.counts,
    checks: j.full.checks,
    verificationOk: j.full.verificationOk,
    metrics: j.full.metrics,
    deliveryStates: j.full.deliveryStates,
    conservationHolds: j.full.conservationHolds,
    bucketsByProduct: j.full.bucketsByProduct,
    expectedByProduct: j.full.expectedByProduct,
  },
  burst: {
    stage: j.burst.stage,
    counts: j.burst.counts,
    verificationOk: j.burst.verificationOk,
    metrics: j.burst.metrics,
    stopClockMs: j.burst.termination.stopClockMs,
  },
});
const evidence = {
  scope: "R3c integration evidence: pre-patch 0.1.0 dist, archived 0.1.0 runtime, current 0.1.1 dist on canonical fixtures. No provider calls.",
  fixtures: {
    "main-warehouse.json": "C6E4F208835E31DE2554850FA618953BB6F9A1B03C360B137C784BD5112660CB",
    "picking-packing-burst.json": "9EDA552BD8F2DA8378C84DCCF5440D8264869AF3013065AE6E34ECB4529CDBF7",
    "picking-packing-burst.runconfig.json": "48FACB5CFD9083240B1FF561D4FB7689B36E63438EEBF9429A3C89B4E727F7A1",
  },
  archive: {
    bundleSha256: "8540D76D3A7B788C1A321C0F8ED7487B7E88593C53355007715766E54113EEEF",
    manifest: "packages/simulation/archive/manifest.json",
    sourceCommit: "a8a88097ac4d5772bd9b334cdc6db7f07d228c5e",
  },
  prePatchDist010: slim(read(a)),
  archived010: slim(read(b)),
  current011: slim(read(c)),
  recordedReplay: {
    liveMetaInvestigation: "ok, verifierImplementationVersion 0.1.0",
    e3PublicComparison: "ok, verifierImplementationVersion 0.1.0",
    e3OfflineComparison: "ok, verifierImplementationVersion 0.1.0",
  },
};
fs.writeFileSync(out, JSON.stringify(evidence, null, 1) + "\n");
console.log("evidence written:", out);

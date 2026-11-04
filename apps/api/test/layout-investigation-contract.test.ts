import { describe, expect, it } from "vitest";
import { defaultApprovedConstraints, parseLayoutProposal } from "@layoutlab/simulation";
import { parseLayoutAction, parseLayoutInterpretation } from "../src/layout-investigation-contract.js";

const interpretation = () => ({
  objective: "Reduce packing travel with fixed workload and service",
  constraints: defaultApprovedConstraints(["PACK-1"]),
  allowedRegions: [{ entityId: "PACK-1", minXMm: 0, minZMm: 0, maxXMm: 30000, maxZMm: 20000 }],
});
const proposal = () => ({
  action: "propose", hypothesis: "Measure this translation", proposalId: "option-1", entityId: "PACK-1",
  parent: { scenarioId: "main-warehouse-1", scenarioContentSha256: "a".repeat(64), schemaVersion: "1", engineVersion: "1" },
  centerMm: { x: 20500, z: 4000 },
});

describe("L2 strict preflight contracts (not an investigation runtime)", () => {
  it("preserves independently parsed authority", () => {
    expect(parseLayoutInterpretation(interpretation(), ["PACK-1", "PACK-2"])).toEqual(interpretation());
  });
  it.each(["requireSameWorkerCount", "requireSameServiceDurations", "requireSameWorkload", "requireSameSeed"])("rejects changed %s", field => {
    const input = interpretation();
    Object.assign(input.constraints, { [field]: false });
    expect(() => parseLayoutInterpretation(input, ["PACK-1"])).toThrow();
  });
  it("rejects receiving authority, excess counts and missing regions", () => {
    for (const patch of [{ allowedEntityIds: ["RCV-1"] }, { maxMovedEntities: 2 }, { maxTranslationMm: 5100 }, { lockedEntityIds: [] }]) {
      const input = interpretation();
      Object.assign(input.constraints, patch);
      expect(() => parseLayoutInterpretation(input, ["PACK-1"])).toThrow();
    }
    expect(() => parseLayoutInterpretation({ ...interpretation(), allowedRegions: [] }, ["PACK-1"])).toThrow();
  });
  it("maps concrete coordinates into the exact production proposal parser", () => {
    const result = parseLayoutAction(proposal());
    expect(result.action).toBe("propose");
    if (result.action === "propose") expect(parseLayoutProposal(result.proposal)).toEqual({ ok: true, supported: true, proposal: result.proposal });
  });
  it.each(["constraints", "extraPickers", "packingDurationMs", "rackId"])("rejects smuggled %s", field => {
    expect(() => parseLayoutAction({ ...proposal(), [field]: 1 })).toThrow();
  });
  it("rejects partial, fractional and ambiguous actions", () => {
    expect(() => parseLayoutAction({ ...proposal(), centerMm: { x: 1.5, z: 0 } })).toThrow();
    expect(() => parseLayoutAction({ action: "finish", candidateId: "option-1", hypothesis: "", centerMm: { x: 0, z: 0 } })).toThrow();
  });
});

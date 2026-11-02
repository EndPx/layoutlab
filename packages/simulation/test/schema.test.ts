import { describe, expect, test } from "vitest";
import { parseOperationsScenario } from "../src/index.js";
import { cloneRaw, tinyOperationsScenario } from "./fixtures.js";

const raw = () => cloneRaw(tinyOperationsScenario());

describe("operations contract", () => {
  test("valid tiny synthetic fixture parses", () => {
    const scenario = parseOperationsScenario(tinyOperationsScenario());
    expect(scenario.schemaVersion).toBe("layoutlab.operations/1");
    expect(scenario.engineVersion).toBe("layoutlab.operations-engine/1");
    expect(scenario.provenance.category).toBe("synthetic");
    expect(scenario.locations).toHaveLength(2);
    expect(scenario.mobileUnits).toHaveLength(2);
    expect(scenario.orderSchedule).toHaveLength(2);
  });

  test("unit semantics: per-item dims and handling cost stay distinct from container loads", () => {
    const scenario = parseOperationsScenario(tinyOperationsScenario());
    const item = scenario.products.find((p) => p.id === "P-B")!;
    // P-B costs 2 handling units per item against a 20-unit picker load:
    // three items consume 6 load units, not "3 boxes".
    expect(item.itemDimensionsMm).toEqual({ width: 300, depth: 200, height: 200 });
    expect(item.capacityCostUnits).toBe(2);
    const picker = scenario.mobileUnits.find((a) => a.id === "M-PICK-1")!;
    expect(picker.loadCapacityUnits).toBe(20);
    expect(3 * item.capacityCostUnits).toBeLessThanOrEqual(
      picker.loadCapacityUnits,
    );
  });

  test("missing storage anchor is rejected", () => {
    const bad = raw();
    const locations = bad.locations as Record<string, unknown>[];
    delete locations[0].storageAnchorMm;
    expect(() => parseOperationsScenario(bad)).toThrow();
  });

  test.each([
    ["location maxQuantity", (v: Record<string, unknown>) => {
      (v.locations as Record<string, unknown>[])[0].maxQuantity = 0;
    }],
    ["service capacity", (v: Record<string, unknown>) => {
      (v.resources as Record<string, unknown>[])[0].serviceCapacity = 0;
    }],
    ["service duration", (v: Record<string, unknown>) => {
      (v.resources as Record<string, unknown>[])[0].serviceDurationMs = 0;
    }],
    ["agent load capacity", (v: Record<string, unknown>) => {
      (v.mobileUnits as Record<string, unknown>[])[0].loadCapacityUnits = 0;
    }],
    ["agent speed", (v: Record<string, unknown>) => {
      (v.mobileUnits as Record<string, unknown>[])[0].speedMmPerSecond = 0;
    }],
    ["order quantity", (v: Record<string, unknown>) => {
      const orders = v.orderSchedule as Record<string, unknown>[];
      ((orders[0].lines as Record<string, unknown>[])[0].quantity as number) = 0;
    }],
  ])("zero %s is rejected where positive is required", (_label, mutate) => {
    const bad = raw();
    mutate(bad);
    expect(() => parseOperationsScenario(bad)).toThrow();
  });

  test("staging capacities admit explicit zero but reject negatives", () => {
    const zero = raw();
    const res = (zero.resources as Record<string, unknown>[])[0];
    res.inputStagingCapacity = 0;
    res.outputStagingCapacity = 0;
    expect(parseOperationsScenario(zero).resources[0].inputStagingCapacity).toBe(0);
    const negative = raw();
    (negative.resources as Record<string, unknown>[])[0].inputStagingCapacity = -1;
    expect(() => parseOperationsScenario(negative)).toThrow();
  });

  test.each([
    ["fractional arrival time", (v: Record<string, unknown>) => {
      (v.orderSchedule as Record<string, unknown>[])[0].arrivalTimeMs = 10.5;
    }],
    ["unsafe arrival time", (v: Record<string, unknown>) => {
      (v.orderSchedule as Record<string, unknown>[])[0].arrivalTimeMs = 2 ** 53;
    }],
    ["fractional quantity", (v: Record<string, unknown>) => {
      const orders = v.orderSchedule as Record<string, unknown>[];
      (orders[0].lines as Record<string, unknown>[])[0].quantity = 1.5;
    }],
    ["unsafe quantity", (v: Record<string, unknown>) => {
      const orders = v.orderSchedule as Record<string, unknown>[];
      (orders[0].lines as Record<string, unknown>[])[0].quantity = 2 ** 53;
    }],
    ["fractional coordinate", (v: Record<string, unknown>) => {
      const locations = v.locations as Record<string, unknown>[];
      (locations[0].approachPointMm as Record<string, unknown>).x = 1.5;
    }],
    ["negative time", (v: Record<string, unknown>) => {
      (v.deliverySchedule as Record<string, unknown>[])[0].arrivalTimeMs = -1;
    }],
  ])("%s is rejected", (_label, mutate) => {
    const bad = raw();
    mutate(bad);
    expect(() => parseOperationsScenario(bad)).toThrow();
  });

  test("unknown keys are rejected at every level", () => {
    const top = raw();
    top.extra = 1;
    expect(() => parseOperationsScenario(top)).toThrow();
    const nested = raw();
    const locations = nested.locations as Record<string, unknown>[];
    locations[0].extra = 1;
    expect(() => parseOperationsScenario(nested)).toThrow();
  });

  test("legacy order.frequency is rejected: scheduled orders use arrival times", () => {
    const bad = raw();
    const orders = bad.orderSchedule as Record<string, unknown>[];
    orders[0].frequency = 4;
    expect(() => parseOperationsScenario(bad)).toThrow();
  });

  test.each([
    ["location rack", (v: Record<string, unknown>) => {
      (v.locations as Record<string, unknown>[])[0].rackId = "R-UNKNOWN";
    }],
    ["stock location", (v: Record<string, unknown>) => {
      (v.initialStock as Record<string, unknown>[])[0].locationId = "L-UNKNOWN";
    }],
    ["stock product", (v: Record<string, unknown>) => {
      (v.initialStock as Record<string, unknown>[])[0].productId = "P-UNKNOWN";
    }],
    ["order product", (v: Record<string, unknown>) => {
      const orders = v.orderSchedule as Record<string, unknown>[];
      (orders[0].lines as Record<string, unknown>[])[0].productId = "P-UNKNOWN";
    }],
    ["delivery product", (v: Record<string, unknown>) => {
      const deliveries = v.deliverySchedule as Record<string, unknown>[];
      (deliveries[0].lines as Record<string, unknown>[])[0].productId = "P-UNKNOWN";
    }],
    ["home product", (v: Record<string, unknown>) => {
      const homes = v.homeAssignments as Record<string, unknown>[];
      homes[0].productId = "P-UNKNOWN";
    }],
    ["home location", (v: Record<string, unknown>) => {
      const homes = v.homeAssignments as Record<string, unknown>[];
      homes[0].locationId = "L-UNKNOWN";
    }],
    ["restriction product", (v: Record<string, unknown>) => {
      const locations = v.locations as Record<string, unknown>[];
      const restrictions = locations[1].restrictions as Record<string, unknown>;
      restrictions.eligibleProductIds = ["P-UNKNOWN"];
    }],
  ])("unresolved %s reference is rejected", (_label, mutate) => {
    const bad = raw();
    mutate(bad);
    expect(() => parseOperationsScenario(bad)).toThrow();
  });

  test.each([
    ["orders", (v: Record<string, unknown>) => {
      const orders = v.orderSchedule as Record<string, unknown>[];
      orders.push(structuredClone(orders[0]));
    }],
    ["agents", (v: Record<string, unknown>) => {
      const agents = v.mobileUnits as Record<string, unknown>[];
      agents.push(structuredClone(agents[0]));
    }],
    ["locations", (v: Record<string, unknown>) => {
      const locations = v.locations as Record<string, unknown>[];
      locations.push(structuredClone(locations[0]));
    }],
    ["products", (v: Record<string, unknown>) => {
      const products = v.products as Record<string, unknown>[];
      products.push(structuredClone(products[0]));
    }],
    ["resources", (v: Record<string, unknown>) => {
      const resources = v.resources as Record<string, unknown>[];
      resources.push(structuredClone(resources[0]));
    }],
    ["deliveries", (v: Record<string, unknown>) => {
      const deliveries = v.deliverySchedule as Record<string, unknown>[];
      deliveries.push(structuredClone(deliveries[0]));
    }],
    ["order-vs-delivery work ids", (v: Record<string, unknown>) => {
      const deliveries = v.deliverySchedule as Record<string, unknown>[];
      deliveries[0].id = "O-1";
    }],
  ])("duplicated %s ids are rejected", (_label, mutate) => {
    const bad = raw();
    mutate(bad);
    expect(() => parseOperationsScenario(bad)).toThrow();
  });

  test.each([
    ["incomplete home coverage", (v: Record<string, unknown>) => {
      v.homeAssignments = (v.homeAssignments as Record<string, unknown>[]).slice(0, 1);
    }],
    ["duplicated home product", (v: Record<string, unknown>) => {
      const homes = v.homeAssignments as Record<string, unknown>[];
      homes.push(structuredClone(homes[0]));
    }],
    ["ineligible home pair", (v: Record<string, unknown>) => {
      const homes = v.homeAssignments as Record<string, unknown>[];
      homes[0].locationId = "L-B1";
    }],
  ])("invalid home assignment (%s) is rejected", (_label, mutate) => {
    const bad = raw();
    mutate(bad);
    expect(() => parseOperationsScenario(bad)).toThrow();
  });

  test("home assignments are optional: storage-only stock parses without them", () => {
    const without = raw();
    delete without.homeAssignments;
    expect(parseOperationsScenario(without).homeAssignments).toBeUndefined();
  });

  test.each([
    ["entry above maxQuantity", (v: Record<string, unknown>) => {
      (v.initialStock as Record<string, unknown>[])[0].quantity = 101;
    }],
    ["second product in one location", (v: Record<string, unknown>) => {
      (v.initialStock as Record<string, unknown>[]).push({
        locationId: "L-A1",
        productId: "P-B",
        quantity: 1,
      });
    }],
    ["ineligible handling class", (v: Record<string, unknown>) => {
      const stock = v.initialStock as Record<string, unknown>[];
      stock[0].locationId = "L-B1";
      stock.splice(1, 1);
    }],
  ])("inconsistent stock (%s) is rejected", (_label, mutate) => {
    const bad = raw();
    mutate(bad);
    expect(() => parseOperationsScenario(bad)).toThrow();
  });

  test("duplicate parking slots and stacked resource slots are rejected", () => {
    const parking = raw();
    const agents = parking.mobileUnits as Record<string, unknown>[];
    agents[1].parkingSlotMm = structuredClone(agents[0].parkingSlotMm);
    expect(() => parseOperationsScenario(parking)).toThrow();
    const stacked = raw();
    const resources = stacked.resources as Record<string, unknown>[];
    const queueSlots = resources[0].queueSlots as Record<string, unknown>[];
    queueSlots[0].x = 5000;
    queueSlots[0].z = 500;
    expect(() => parseOperationsScenario(stacked)).toThrow();
  });

  test("arrivals past the fixed-window horizon are rejected", () => {
    const bad = raw();
    (bad.orderSchedule as Record<string, unknown>[])[1].arrivalTimeMs = 3_600_001;
    expect(() => parseOperationsScenario(bad)).toThrow();
  });

  test("finite-cohort mode parses and enforces its arrival cutoff", () => {
    const cohort = raw();
    const policies = cohort.policies as Record<string, unknown>;
    policies.run = { mode: "finite-cohort", arrivalCutoffMs: 60000 };
    expect(parseOperationsScenario(cohort).policies.run).toEqual({
      mode: "finite-cohort",
      arrivalCutoffMs: 60000,
    });
    const late = raw();
    (late.policies as Record<string, unknown>).run = {
      mode: "finite-cohort",
      arrivalCutoffMs: 59999,
    };
    expect(() => parseOperationsScenario(late)).toThrow();
  });

  test("empty schedules parse: storage-only stock with idle resources", () => {
    const idle = raw();
    idle.orderSchedule = [];
    idle.deliverySchedule = [];
    const scenario = parseOperationsScenario(idle);
    expect(scenario.orderSchedule).toEqual([]);
    expect(scenario.initialStock).toHaveLength(2);
  });
});

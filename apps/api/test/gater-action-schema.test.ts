import { expect, it } from "vitest";
import { GATER_INVESTIGATION_ACTION_JSON_SCHEMA as schema, INVESTIGATION_ACTION_JSON_SCHEMA as historical } from "../src/operations-investigations.js";
it("Gater action schema mirrors required candidate and patch null branches without changing historical schema", () => {
  expect(schema.allOf[0]!.if.properties.action.const).toBe("run_experiment");
  expect(schema.allOf[0]!.then.properties.candidateId).toEqual({type:"null"});
  expect(schema.allOf[1]!.if.properties.action.const).toBe("finish");
  expect(schema.allOf[1]!.then.properties).toEqual({
    extraPickers:{type:"null"},extraPutaway:{type:"null"},packingDurationMs:{type:"null"},
    dispatchDurationMs:{type:"null"},receivingDurationMs:{type:"null"},candidateId:{type:"string",minLength:1,maxLength:128},
  });
  expect(historical).not.toHaveProperty("allOf");
  expect(schema.required).toEqual(historical.required);
});

import { parseProviderLayoutAction, LAYOUT_ACTION_JSON_SCHEMA, LAYOUT_INTERPRETATION_JSON_SCHEMA } from "../src/layout-investigations.js";
import { describe, expect, it } from "vitest";
import { deriveProviderKind, loadConfig } from "../src/config.js";
import { redactStructured, chatCompletionJson, generationSettingsOf, type FetchLike } from "../src/provider.js";
const config = loadConfig({ MODEL_API_BASE_URL: "https://api.gater.ai.id/v1", MODEL_ID: "glm-5-3-flash", MODEL_API_KEY: "test-secret-only" });
const call = { schemaName: "test", schema: { type: "object" }, developerInstruction: "JSON only", userContent: "test" };
const fake = (body: string, status = 200): FetchLike => async () => new Response(body, { status });
describe("Gater offline foundation", () => {
  it("classifies exact origins and preserves aliases", () => {
    expect(config.providerKind).toBe("gater");
    expect(loadConfig({ META_MODEL_ID: "old" }).modelId).toBe("old");
    expect(deriveProviderKind("https://api.meta.ai:443/v1")).toBe("meta");
    expect(deriveProviderKind("http://127.0.0.1:3456/v1")).toBe("fixture");
    for (const url of ["https://user:pass@api.gater.ai.id/v1", "https://api.gater.ai.id:444/v1", "https://api.gater.ai.id/v1?q=1", "https://api.gater.ai.id/v1#x", "https://api.gater.ai.id.evil/v1", "https://api.gater.ai.id/v1/extra", "https://api.meta.ai:444/v1"]) expect(deriveProviderKind(url)).toBe("unsupported");
  });
  it("records literal provider settings and preserves safe fetch classifications", async () => {
    expect(generationSettingsOf(config)).toEqual({ reasoningEffort: "low", maxCompletionTokens: 8192 });
    for (const base of ["https://api.meta.ai/v1", "http://localhost:3456/v1"]) {
      expect(generationSettingsOf(loadConfig({ MODEL_API_BASE_URL: base }))).toEqual({ reasoningEffort: "low", maxCompletionTokens: 2000 });
    }
    for (const host of ["api.meta.ai", "api.gater.ai.id"]) {
      for (const url of [`https://u:p@${host}/v1`, `https://${host}:444/v1`, `https://${host}.evil/v1`, `https://${host}/v1/extra`, `https://${host}/v1?q=1`, `https://${host}/v1#x`]) expect(deriveProviderKind(url)).toBe("unsupported");
    }
    expect(loadConfig({ MODEL_ID: "new", META_MODEL_ID: "old", MODEL_API_BASE_URL: "https://api.gater.ai.id/v1", META_API_BASE_URL: "https://api.meta.ai/v1" })).toMatchObject({ modelId: "new", providerKind: "gater" });
    const transport: FetchLike = async () => { throw Object.assign(new Error(config.apiKey), { code: "ECONNRESET", status: 503, cause: config.apiKey }); };
    await expect(chatCompletionJson(config, call, new AbortController().signal, transport)).rejects.toMatchObject({ message: "[REDACTED]", code: "ECONNRESET", status: 503 });
  });
  it("sends one bounded explicit Gater payload", async () => {
    let count = 0;
    const transport: FetchLike = async (url, init) => {
      count++;
      expect(url).toBe("https://api.gater.ai.id/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("glm-5-3-flash");
      expect(body.max_tokens).toBe(8192);
      expect(body.max_completion_tokens).toBeUndefined();
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[0].content).toContain(JSON.stringify(call.schema));
      expect(body.messages[0].content).toContain("All required properties must be present");
      expect(body.reasoning_effort).toBe("low");
      expect(body.thinking).toEqual({ type: "enabled" });
      expect(body.response_format.json_schema.strict).toBe(true);
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }));
    };
    expect((await chatCompletionJson(config, call, new AbortController().signal, transport)).parsed).toEqual({});
    expect(count).toBe(1);
  });
  it("redacts failures and rejects malformed structured content", async () => {
    await expect(chatCompletionJson(config, call, new AbortController().signal, fake(config.apiKey, 401))).rejects.toThrow("[REDACTED]");
    await expect(chatCompletionJson(config, call, new AbortController().signal, fake(JSON.stringify({ choices: [{ message: { content: "invalid" } }] })))).rejects.toThrow("not valid structured JSON");
    await expect(chatCompletionJson(config, call, new AbortController().signal, fake("{}"))).rejects.toThrow("no message content");
  });
  it("enforces abort, prompt and response caps without network", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(chatCompletionJson(config, call, controller.signal, fake("{}"))).rejects.toThrow();
    await expect(chatCompletionJson(config, { ...call, userContent: "x".repeat(50000) }, new AbortController().signal, fake("{}"))).rejects.toThrow("context bound");
    await expect(chatCompletionJson({ ...config, maxResponseBytes: 2 }, call, new AbortController().signal, fake("xxxx"))).rejects.toThrow("byte bound");
  });
});

it("redacts structured secrets without truncating over 2000 characters", () => {
 const value = { text: "x".repeat(6000), nested: [config.apiKey, "Bearer abc-secret"], count: 3, nil: null };
 const result = redactStructured(value, config);
 expect(result.text).toHaveLength(6000);
 expect(result.nested).toEqual(["[REDACTED]", "Bearer [REDACTED]"]);
 expect(JSON.parse(JSON.stringify(result))).toEqual(result);
 expect(result.count).toBe(3); expect(result.nil).toBeNull();
});

it("keeps token ceiling scoped to exact model and provider", () => {
 for(const provider of ["https://api.meta.ai/v1","http://localhost:3456/v1","https://api.gater.ai.id/v1"]) {
  const c=loadConfig({MODEL_API_BASE_URL:provider,MODEL_ID:"unknown"}); expect(c.maxCompletionTokens).toBe(2000);
 }
});

it("advertises existing layout text bounds in provider schema",()=>{
 expect(LAYOUT_ACTION_JSON_SCHEMA.properties.hypothesis).toMatchObject({maxLength:500});
 expect(LAYOUT_INTERPRETATION_JSON_SCHEMA.properties.objective).toMatchObject({minLength:1,maxLength:500});
});

it("retains literal 500/501 and exact nullable action boundaries",()=>{
 const propose={action:"propose",hypothesis:"x".repeat(500),proposalId:"p",entityId:"PACK-1",parent:{scenarioId:"s",scenarioContentSha256:"a".repeat(64),schemaVersion:"v",engineVersion:"v"},centerMm:{x:100,z:200},candidateId:null};
 expect(()=>parseProviderLayoutAction(propose)).not.toThrow();
 expect(()=>parseProviderLayoutAction({...propose,hypothesis:"x".repeat(501)})).toThrow();
 expect(()=>parseProviderLayoutAction({...propose,candidateId:"p"})).toThrow();
 const finish={action:"finish",hypothesis:"x".repeat(500),proposalId:null,entityId:null,parent:null,centerMm:null,candidateId:"baseline"};
 expect(()=>parseProviderLayoutAction(finish)).not.toThrow();
 for(const field of ["proposalId","entityId","parent","centerMm"])expect(()=>parseProviderLayoutAction({...finish,[field]:"unexpected"})).toThrow();
 expect(()=>parseProviderLayoutAction({...finish,candidateId:null})).toThrow();
 expect(()=>parseProviderLayoutAction({...propose,proposalId:""})).toThrow();
 expect(()=>parseProviderLayoutAction({...propose,parent:{...propose.parent,scenarioContentSha256:"bad"}})).toThrow();
 expect(LAYOUT_ACTION_JSON_SCHEMA.properties.parent).toMatchObject({properties:{scenarioContentSha256:{pattern:"^[a-f0-9]{64}$"}}});
});

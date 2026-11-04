// Portable identity helpers: no Node-only builtins anywhere in this module
// graph, so the same code bundles for the browser. Hashing uses the
// platform WebCrypto API (globalThis.crypto.subtle, available in browsers
// and Node >= 19) behind an explicit async boundary. No hand-written
// cryptography and no crypto framework.

// Canonical JSON: sorted object keys, array order preserved (engine array
// order is deterministic and meaningful). Used for scenario identity only;
// file-byte provenance is a separate Node-side adapter concern (scripts).
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
    .join(",")}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto subtle is unavailable in this runtime; content hashing requires it (browser or Node >= 19)");
  }
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function contentSha256(value: unknown): Promise<string> {
  return sha256Hex(canonicalStringify(value));
}

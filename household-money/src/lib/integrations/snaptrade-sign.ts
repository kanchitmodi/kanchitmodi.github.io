import { createHmac } from "node:crypto";

/** Deterministic JSON with sorted keys and no whitespace (SnapTrade canonical form). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

/**
 * SnapTrade request signature: HMAC-SHA256 over {content, path, query} with the consumer key,
 * base64-encoded, sent as the `Signature` header. The consumer key itself is never transmitted.
 */
export function snaptradeSignature(
  consumerKey: string,
  path: string,
  query: string,
  body: unknown = null,
): string {
  const payload = canonicalJson({ content: body ?? null, path, query });
  return createHmac("sha256", encodeURI(consumerKey)).update(payload).digest("base64");
}

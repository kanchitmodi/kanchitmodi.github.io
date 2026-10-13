/** Bank of Canada Valet API — official daily rates, no key. */
export const VALET_BASE = "https://www.bankofcanada.ca/valet";

export interface FxObservation {
  date: string;
  usdcad: number;
}

export function parseValetUsdCad(json: unknown): FxObservation {
  const obs = (json as { observations?: { d: string; FXUSDCAD?: { v: string } }[] })
    .observations?.[0];
  const v = obs?.FXUSDCAD?.v;
  if (!obs || !v || !Number.isFinite(Number(v))) throw new Error("Unexpected Valet response");
  return { date: obs.d, usdcad: Number(v) };
}

export async function fetchLatestUsdCad(fetchImpl: typeof fetch = fetch): Promise<FxObservation> {
  const res = await fetchImpl(`${VALET_BASE}/observations/FXUSDCAD/json?recent=1`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Valet HTTP ${res.status}`);
  return parseValetUsdCad(await res.json());
}

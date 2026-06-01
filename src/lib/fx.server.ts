// Server-side currency conversion. Caches in-memory for 6h.
let cache: { ts: number; rates: Record<string, number> } | null = null;

async function rates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.ts < 6 * 60 * 60 * 1000) return cache.rates;
  const r = await fetch("https://open.er-api.com/v6/latest/USD");
  const j = await r.json() as { result: string; rates: Record<string, number> };
  if (j?.result !== "success") throw new Error("FX lookup failed");
  cache = { ts: Date.now(), rates: j.rates };
  return j.rates;
}

export async function toUsd(amount: number, fromCurrency: string): Promise<{ usd: number; rate: number }> {
  const c = fromCurrency.toUpperCase();
  if (c === "USD") return { usd: Number(amount.toFixed(2)), rate: 1 };
  const r = await rates();
  const rate = r[c];
  if (!rate) throw new Error(`Unsupported currency ${c}`);
  // rate = units of C per 1 USD
  const usd = amount / rate;
  return { usd: Number(usd.toFixed(2)), rate };
}
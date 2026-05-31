// Lightweight FX + currency helpers. Display-only conversion.
// Uses open.er-api.com (free, no key) with localStorage caching for 6h.

export const USD_REVIEW_THRESHOLD = 1000;

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  Kenya: "KES", Uganda: "UGX", Tanzania: "TZS", Rwanda: "RWF", Nigeria: "NGN",
  Ghana: "GHS", "South Africa": "ZAR", Egypt: "EGP", Morocco: "MAD", Ethiopia: "ETB",
  "United States": "USD", Canada: "CAD", "United Kingdom": "GBP", Ireland: "EUR",
  Germany: "EUR", France: "EUR", Spain: "EUR", Italy: "EUR", Netherlands: "EUR",
  Portugal: "EUR", Belgium: "EUR", Greece: "EUR", Finland: "EUR", Austria: "EUR",
  Switzerland: "CHF", Sweden: "SEK", Norway: "NOK", Denmark: "DKK", Poland: "PLN",
  Australia: "AUD", "New Zealand": "NZD", Japan: "JPY", China: "CNY", India: "INR",
  Pakistan: "PKR", Bangladesh: "BDT", "Sri Lanka": "LKR", Indonesia: "IDR",
  Philippines: "PHP", Vietnam: "VND", Thailand: "THB", Malaysia: "MYR", Singapore: "SGD",
  "South Korea": "KRW", Taiwan: "TWD", "Hong Kong": "HKD", "United Arab Emirates": "AED",
  "Saudi Arabia": "SAR", Qatar: "QAR", Kuwait: "KWD", Bahrain: "BHD", Oman: "OMR",
  Israel: "ILS", Turkey: "TRY", Russia: "RUB", Ukraine: "UAH", Brazil: "BRL",
  Argentina: "ARS", Chile: "CLP", Colombia: "COP", Mexico: "MXN", Peru: "PEN",
};

export function currencyForCountry(country?: string | null): string {
  if (!country) return "USD";
  return COUNTRY_TO_CURRENCY[country] ?? "USD";
}

interface RateCache { ts: number; base: string; rates: Record<string, number> }

async function getRates(base = "USD"): Promise<Record<string, number>> {
  const key = `fx_${base}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const c = JSON.parse(raw) as RateCache;
      if (Date.now() - c.ts < 6 * 60 * 60 * 1000) return c.rates;
    }
  } catch { /* ignore */ }
  const r = await fetch(`https://open.er-api.com/v6/latest/${base}`);
  const j = await r.json();
  if (j?.result !== "success") throw new Error("FX lookup failed");
  const rates = j.rates as Record<string, number>;
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), base, rates } as RateCache)); } catch { /* ignore */ }
  return rates;
}

export async function convert(amount: number, from: string, to: string): Promise<number> {
  if (from === to) return amount;
  const rates = await getRates(from.toUpperCase());
  const r = rates[to.toUpperCase()];
  if (!r) throw new Error(`No rate ${from}→${to}`);
  return amount * r;
}

export async function toUsd(amount: number, from: string): Promise<number> {
  if (from.toUpperCase() === "USD") return amount;
  // open.er-api lets us fetch USD base and invert.
  const rates = await getRates("USD");
  const r = rates[from.toUpperCase()];
  if (!r) throw new Error(`No rate USD→${from}`);
  return amount / r;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

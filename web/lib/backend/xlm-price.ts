import { bizEvent } from './logger';

const RATES_URL = 'https://rates.ctx.com/rates?symbol=xlmusd';

const MIN_SANE_PRICE = 0.001;
const MAX_SANE_PRICE = 10.0;
const CACHE_TTL_MS = 30_000;

let _cache: { price: number; fetchedAt: number } | null = null;
let _inFlight: Promise<number> | null = null;

export function _resetCache() {
  _cache = null;
  _inFlight = null;
}

export async function getXlmUsdPrice(): Promise<number> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.price;
  }

  if (_inFlight) {
    return _inFlight;
  }

  _inFlight = (async () => {
    try {
      const res = await fetch(RATES_URL, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`CTX rates API error: HTTP ${res.status}`);

      const rates = await res.json();
      if (!Array.isArray(rates)) {
        throw new Error(`CTX rates API returned non-array response (got ${typeof rates})`);
      }
      const avg = rates.find((r: any) => r && r.source === 'ctx-average');
      if (!avg) throw new Error('ctx-average entry missing from CTX rates response');

      const price = parseFloat(avg.price);
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error(`Invalid XLM price from CTX: ${avg.price}`);
      }
      if (price < MIN_SANE_PRICE || price > MAX_SANE_PRICE) {
        bizEvent('xlm_price.out_of_bounds', { price, min: MIN_SANE_PRICE, max: MAX_SANE_PRICE });
        throw new Error(
          `XLM price ${price} is outside sanity bounds [${MIN_SANE_PRICE}, ${MAX_SANE_PRICE}] — ` +
            `refusing to quote.`
        );
      }

      _cache = { price, fetchedAt: Date.now() };
      return price;
    } finally {
      _inFlight = null;
    }
  })();

  return _inFlight;
}

export async function usdToXlm(amountUsd: string | number): Promise<string> {
  const parsed = typeof amountUsd === 'number' ? amountUsd : parseFloat(String(amountUsd));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`usdToXlm: invalid amountUsd '${amountUsd}'`);
  }
  const price = await getXlmUsdPrice();
  const xlm = parsed / price;
  return xlm.toFixed(7);
}

# ADR: Market data and valuation

Status: accepted. Epic #62, issues #22 (FX), #23 (prices), #24 (revaluation),
#25 (freshness), #26 (IAS 21).

## Context

The books held quantities and a single hand-entered FX rate. There was no market
price, so a holding could not be valued, and nothing said how old a rate was.
This ADR records the sources, the storage, and the valuation rules.

## Decision

### Sources (both keyless, read-only)

- **Prices:** CoinGecko `simple/price`, mapped from asset codes to CoinGecko ids
  in `src/adapters/market/prices.ts`.
- **FX:** the ECB reference rates via `exchangerate.host` in
  `src/adapters/market/fx.ts`.

Both are fetched with an injectable `fetch`, so they are tested without the
network. A failed fetch is best-effort: the last stored value stays and the
pages show its age.

### Storage

- `asset_prices` (migration `0010`): asset, quote currency, `price_minor`
  (`numeric(78,0)`), `quote_scale`, `as_of`, `origin` (`example` | `live`), and
  `source`. A price never posts to the journal.
- `fx_rates` already carried `origin`, `as_of`, and a rational
  `numerator/scale`. Live rates are written there; each ordered pair is stored
  once and the inverse is derived, matching the manual form.

### Valuation rules (`src/ledger/valuation.ts`)

- Prices are rational, never floats. Valuation multiplies quantity by price and
  rounds half-up, the same convention as FX translation.
- `selectAssetPrice` takes the newest price on or before the reference time; a
  live row wins over an example row at the same instant.
- A holding with no price is reported as **unpriced**, not valued at zero. A
  summary is `incomplete` when any holding is unpriced or stale, and `stale`
  when a used price is older than `DEFAULT_STALENESS_MS` (24h).

### Revaluation and translation

- `proposeRevaluation` computes carrying vs market per asset and returns **one
  balanced entry** for the net difference, plus per-asset detail. It never posts:
  the accountant posts it deliberately through the existing immutable path, and a
  wrong one is corrected by a reversal. The entry carries a reference and memo.
- `translateGroupIas21` translates assets and liabilities at the closing rate,
  income and expense at the average rate, and books the residual to a translation
  reserve (`3200`), so the presented group balances. An entity missing either rate
  is left out and reported.

### Freshness

Every value shown on the Sources and Combined pages carries its source, origin,
and age. A stale total is flagged provisional; a stale revaluation is marked so.
Live refresh is available from the UI (`source.write`) and from the scheduled
pass, and by `pnpm market:refresh`.

## Consequences

- A holding can be valued at a sourced, dated price, and staleness is visible.
- Revaluation is reviewable and reversible; nothing posts automatically.
- Live fetch failure never blocks sync; the last value ages out visibly.
- The scheduled cron pass now also refreshes prices and FX, best-effort.

## Not done

- Prices are spot only; no historical price series is stored, so average rates
  for IAS 21 income/expense use the period-start rate as the representative rate
  rather than a true average. A price/rate time series is a follow-up.
- Revaluation posts directly (reviewed by the accountant); routing it through a
  formal approval workflow is epic #66.

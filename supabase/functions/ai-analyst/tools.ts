/* ------------------------------------------------------------------
   TOOL CATALOG + EXECUTOR for the Finance AI agent.
   - TOOLS is a frozen, deterministically-ordered constant so the
     tools→system prompt cache prefix never changes between requests.
   - Reads execute automatically under the caller's JWT (RLS).
   - Writes (names in WRITE_TOOLS) only execute via the approval flow
     in index.ts — never directly from a model turn.
   ------------------------------------------------------------------ */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface ToolOutcome {
  content: string;
  is_error?: boolean;
  changes?: { table: string; op: "insert" | "update" | "delete"; ids: string[] }[];
}

const S = (desc: string, props: Record<string, unknown>, required: string[] = []) => ({
  description: desc,
  input_schema: {
    type: "object",
    properties: props,
    required,
    additionalProperties: false,
  },
});

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });

/* ---------------------------- schemas ---------------------------- */

export const TOOLS = [
  {
    name: "get_portfolio_summary",
    ...S(
      "Aggregated snapshot of the user's portfolio: total market value, cost basis, unrealized P&L, weighted beta, cash, buying power, sector weights, and every equity position with live price, weight and P&L. Call this FIRST for any question about 'my portfolio', concentration, risk, allocation, or what to buy/sell.",
      {},
    ),
  },
  {
    name: "list_equity_holdings",
    ...S(
      "Raw equity_holdings rows including row ids. Call before update_equity/delete_equity to obtain the id, or when you need purchase dates and notes.",
      {},
    ),
  },
  {
    name: "list_bond_holdings",
    ...S(
      "Raw bond_holdings rows including row ids (type, identifier, face value, quantity, coupon, maturity, rating). Call for any bond question and before update_bond/delete_bond.",
      {},
    ),
  },
  {
    name: "list_transactions",
    ...S(
      "Trade history (buys/sells) with row ids, newest first. Call when reviewing trading decisions, computing realized P&L, or before delete_transaction.",
      {
        symbol: str("Filter to one ticker, e.g. AAPL"),
        side: { type: "string", enum: ["buy", "sell"], description: "Filter by side" },
        start_date: str("ISO date YYYY-MM-DD inclusive"),
        end_date: str("ISO date YYYY-MM-DD inclusive"),
        limit: num("Max rows, default 100, max 500"),
      },
    ),
  },
  { name: "get_balances", ...S("Cash, buying power and currency from account_balances.", {}) },
  { name: "list_watchlist", ...S("Watchlist rows with ids and symbols.", {}) },
  {
    name: "get_quotes",
    ...S(
      "Live market quotes (price, change %, beta, P/E, market cap, sector, dividend yield) from the 5-minute quote cache. Omit tickers for all cached quotes.",
      { tickers: { type: "array", items: { type: "string" }, description: "Tickers, e.g. ['AAPL','NVDA']" } },
    ),
  },
  {
    name: "get_market_overview",
    ...S(
      "Market indices (SPY, QQQ, VIX, gold, oil, dollar), the full US Treasury yield curve, and cached bond market quotes. Call for macro questions, rate questions, or to get the live 10Y for CAPM.",
      {},
    ),
  },
  {
    name: "get_price_history",
    ...S(
      "Daily OHLC history for one symbol. Use interval weekly/monthly for long ranges to save space. Essential for trade reviews (what happened after a buy/sell) and performance analysis.",
      {
        symbol: str("Ticker, e.g. AAPL"),
        start_date: str("ISO date YYYY-MM-DD, default 1 year ago"),
        end_date: str("ISO date YYYY-MM-DD, default today"),
        interval: { type: "string", enum: ["daily", "weekly", "monthly"], description: "Downsampling, default daily" },
      },
      ["symbol"],
    ),
  },
  {
    name: "get_news",
    ...S(
      "Cached market/company news headlines. Filter by symbols. For breaking news beyond the cache, use web_search instead.",
      {
        symbols: { type: "array", items: { type: "string" }, description: "Filter to these tickers" },
        limit: num("Max items, default 20"),
      },
    ),
  },
  {
    name: "list_income",
    ...S("Dividend income rows and cash deposits/withdrawals. Call for income, yield-on-cost, or cash-flow questions.", {}),
  },

  /* --------------------------- writes --------------------------- */
  {
    name: "add_equity",
    ...S(
      "Add a new equity position to the portfolio. Requires user confirmation. If the user already holds the ticker, prefer update_equity with the combined share count and blended cost instead.",
      {
        ticker: str("Ticker symbol, will be uppercased"),
        shares: num("Number of shares"),
        cost_per_share: num("Cost per share in USD"),
        purchase_date: str("ISO date YYYY-MM-DD"),
        notes: str("Optional note"),
      },
      ["ticker", "shares", "cost_per_share"],
    ),
  },
  {
    name: "update_equity",
    ...S(
      "Update fields of an existing equity position. Requires user confirmation. Get the id from list_equity_holdings first. Only include fields you are changing.",
      {
        id: str("Row id from list_equity_holdings"),
        ticker: str("New ticker"),
        shares: num("New share count"),
        cost_per_share: num("New cost per share"),
        purchase_date: str("ISO date YYYY-MM-DD"),
        notes: str("New note"),
      },
      ["id"],
    ),
  },
  {
    name: "delete_equity",
    ...S("Remove an equity position entirely. Requires user confirmation. Get the id from list_equity_holdings first.", { id: str("Row id") }, ["id"]),
  },
  {
    name: "add_bond",
    ...S(
      "Add a bond position. Requires user confirmation.",
      {
        bond_type: { type: "string", enum: ["sovereign", "government", "corporate"], description: "Bond category" },
        identifier: str("Identifier / CUSIP / name, e.g. 'US10Y' or CUSIP"),
        name: str("Display name"),
        face_value: num("Face value per bond in USD"),
        quantity: num("Number of bonds"),
        purchase_price: num("Clean price paid, % of par (e.g. 98.5)"),
        purchase_yield: num("Yield at purchase, %"),
        coupon_rate: num("Coupon, %"),
        maturity_date: str("ISO date YYYY-MM-DD"),
        rating: str("Credit rating, e.g. AA+"),
        purchase_date: str("ISO date YYYY-MM-DD"),
        notes: str("Optional note"),
      },
      ["bond_type", "identifier", "face_value", "quantity"],
    ),
  },
  {
    name: "update_bond",
    ...S(
      "Update fields of an existing bond position. Requires user confirmation. Get the id from list_bond_holdings first. Only include fields you are changing.",
      {
        id: str("Row id from list_bond_holdings"),
        bond_type: { type: "string", enum: ["sovereign", "government", "corporate"], description: "Bond category" },
        identifier: str("Identifier / CUSIP"),
        name: str("Display name"),
        face_value: num("Face value per bond in USD"),
        quantity: num("Number of bonds"),
        purchase_price: num("Clean price, % of par"),
        purchase_yield: num("Yield at purchase, %"),
        coupon_rate: num("Coupon, %"),
        maturity_date: str("ISO date YYYY-MM-DD"),
        rating: str("Credit rating"),
        purchase_date: str("ISO date YYYY-MM-DD"),
        notes: str("New note"),
      },
      ["id"],
    ),
  },
  {
    name: "delete_bond",
    ...S("Remove a bond position. Requires user confirmation. Get the id from list_bond_holdings first.", { id: str("Row id") }, ["id"]),
  },
  {
    name: "add_transaction",
    ...S(
      "Record a buy or sell in the trade history. Requires user confirmation. This records history only — also propose add_equity/update_equity to reflect the position change.",
      {
        symbol: str("Ticker, will be uppercased"),
        asset_type: { type: "string", enum: ["equity", "bond"], description: "Default equity" },
        side: { type: "string", enum: ["buy", "sell"], description: "Trade side" },
        quantity: num("Quantity traded"),
        price: num("Execution price per share/unit"),
        commission: num("Commission in USD, default 0"),
        fees: num("Fees in USD, default 0"),
        trade_time: str("ISO datetime of execution, default now"),
        realized_pnl: num("Realized P&L for sells, USD"),
        notes: str("Optional note"),
      },
      ["symbol", "side", "quantity", "price"],
    ),
  },
  {
    name: "delete_transaction",
    ...S("Delete a transaction record. Requires user confirmation. Get the id from list_transactions first.", { id: str("Row id") }, ["id"]),
  },
  {
    name: "update_buying_power",
    ...S(
      "Set the account's buying power (and optionally cash). Requires user confirmation.",
      { buying_power: num("New buying power in USD"), cash: num("New cash balance in USD") },
      ["buying_power"],
    ),
  },
  {
    name: "add_to_watchlist",
    ...S(
      "Add a symbol to the watchlist. Requires user confirmation.",
      {
        symbol: str("Ticker"),
        instrument_type: { type: "string", enum: ["equity", "bond"], description: "Default equity" },
      },
      ["symbol"],
    ),
  },
  {
    name: "remove_from_watchlist",
    ...S(
      "Remove a watchlist entry by symbol. Requires user confirmation.",
      { symbol: str("Ticker to remove") },
      ["symbol"],
    ),
  },
] as const;

export const WRITE_TOOLS = new Set([
  "add_equity",
  "update_equity",
  "delete_equity",
  "add_bond",
  "update_bond",
  "delete_bond",
  "add_transaction",
  "delete_transaction",
  "update_buying_power",
  "add_to_watchlist",
  "remove_from_watchlist",
]);

/** Human label streamed as a `status` event while a tool runs. */
export const TOOL_STATUS: Record<string, string> = {
  get_portfolio_summary: "Reading your portfolio…",
  list_equity_holdings: "Reading your holdings…",
  list_bond_holdings: "Reading your bonds…",
  list_transactions: "Reading your trade history…",
  get_balances: "Checking balances…",
  list_watchlist: "Reading your watchlist…",
  get_quotes: "Fetching quotes…",
  get_market_overview: "Reading market data…",
  get_price_history: "Loading price history…",
  get_news: "Scanning news…",
  list_income: "Reading income data…",
  add_equity: "Adding position…",
  update_equity: "Updating position…",
  delete_equity: "Removing position…",
  add_bond: "Adding bond…",
  update_bond: "Updating bond…",
  delete_bond: "Removing bond…",
  add_transaction: "Recording transaction…",
  delete_transaction: "Deleting transaction…",
  update_buying_power: "Updating balances…",
  add_to_watchlist: "Updating watchlist…",
  remove_from_watchlist: "Updating watchlist…",
};

/** Short human-readable action label for confirmation cards. */
export const WRITE_LABELS: Record<string, string> = {
  add_equity: "Add equity position",
  update_equity: "Update equity position",
  delete_equity: "Delete equity position",
  add_bond: "Add bond position",
  update_bond: "Update bond position",
  delete_bond: "Delete bond position",
  add_transaction: "Record transaction",
  delete_transaction: "Delete transaction",
  update_buying_power: "Update buying power",
  add_to_watchlist: "Add to watchlist",
  remove_from_watchlist: "Remove from watchlist",
};

/* --------------------------- executor --------------------------- */

type Sb = SupabaseClient;
const ok = (data: unknown, changes?: ToolOutcome["changes"]): ToolOutcome => ({
  content: JSON.stringify(data ?? null),
  changes,
});
const fail = (message: string): ToolOutcome => ({ content: `Error: ${message}`, is_error: true });

async function registerInstrument(sb: Sb, type: string, symbol: string) {
  await sb
    .from("instrument_registry")
    .upsert({ instrument_type: type, symbol, is_active: true }, { onConflict: "instrument_type,symbol" });
}

function downsample(rows: { date: string }[], interval: string) {
  if (interval !== "weekly" && interval !== "monthly") return rows;
  const keyOf = (d: string) => {
    const dt = new Date(d);
    if (interval === "monthly") return `${dt.getUTCFullYear()}-${dt.getUTCMonth()}`;
    const oneJan = Date.UTC(dt.getUTCFullYear(), 0, 1);
    const week = Math.floor((dt.getTime() - oneJan) / 86400000 / 7);
    return `${dt.getUTCFullYear()}-w${week}`;
  };
  const byKey = new Map<string, { date: string }>();
  for (const r of rows) byKey.set(keyOf(r.date), r); // rows sorted asc → keeps last of period
  return [...byKey.values()];
}

export async function executeTool(sb: Sb, name: string, input: Record<string, unknown>): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "get_portfolio_summary": {
        const [h, b, q, curve] = await Promise.all([
          sb.from("equity_holdings").select("*"),
          sb.from("account_balances").select("*").maybeSingle(),
          sb.from("market_equity_quotes").select("*"),
          sb.from("market_yield_curve").select("*"),
        ]);
        const quotes = new Map((q.data ?? []).map((r: Record<string, unknown>) => [r.ticker, r]));
        const positions = (h.data ?? []).map((row: Record<string, unknown>) => {
          const quote = quotes.get(row.ticker) as Record<string, number> | undefined;
          const price = Number(quote?.price ?? 0);
          const shares = Number(row.shares);
          const cost = Number(row.cost_per_share);
          const mv = price * shares;
          const cb = cost * shares;
          return {
            id: row.id,
            ticker: row.ticker,
            sector: quote?.sector ?? null,
            shares,
            cost_per_share: cost,
            price,
            market_value: Math.round(mv * 100) / 100,
            unrealized_pnl: Math.round((mv - cb) * 100) / 100,
            unrealized_pnl_pct: cb ? Math.round(((mv - cb) / cb) * 10000) / 100 : 0,
            beta: Number(quote?.beta ?? 0),
          };
        });
        const totalMV = positions.reduce((s, p) => s + p.market_value, 0);
        const totalCB = positions.reduce((s, p) => s + p.shares * p.cost_per_share, 0);
        const sectors: Record<string, number> = {};
        for (const p of positions) {
          const sec = String(p.sector ?? "Unknown");
          sectors[sec] = (sectors[sec] ?? 0) + p.market_value;
        }
        const sectorWeights = Object.fromEntries(
          Object.entries(sectors).map(([k, v]) => [k, totalMV ? Math.round((v / totalMV) * 1000) / 10 : 0]),
        );
        const tenY = (curve.data ?? []).find((p: Record<string, unknown>) => p.tenor === "10Y")?.yield ?? null;
        positions.forEach((p: Record<string, unknown>) => {
          (p as Record<string, unknown>).weight_pct = totalMV
            ? Math.round((Number(p.market_value) / totalMV) * 1000) / 10
            : 0;
        });
        return ok({
          total_market_value: Math.round(totalMV * 100) / 100,
          total_cost_basis: Math.round(totalCB * 100) / 100,
          unrealized_pnl: Math.round((totalMV - totalCB) * 100) / 100,
          portfolio_beta: totalMV
            ? Math.round(positions.reduce((s, p) => s + p.beta * (p.market_value / totalMV), 0) * 100) / 100
            : 0,
          cash: Number(b.data?.cash ?? 0),
          buying_power: Number(b.data?.buying_power ?? 0),
          ust_10y_yield: tenY != null ? Number(tenY) : null,
          sector_weights_pct: sectorWeights,
          positions: positions.sort((a, b2) => b2.market_value - a.market_value),
        });
      }
      case "list_equity_holdings": {
        const { data, error } = await sb.from("equity_holdings").select("*").order("created_at");
        if (error) return fail(error.message);
        return ok(data);
      }
      case "list_bond_holdings": {
        const { data, error } = await sb.from("bond_holdings").select("*").order("created_at");
        if (error) return fail(error.message);
        return ok(data);
      }
      case "list_transactions": {
        const limit = Math.min(Number(input.limit ?? 100), 500);
        let qy = sb.from("transactions").select("*").order("trade_time", { ascending: false }).limit(limit);
        if (input.symbol) qy = qy.eq("symbol", String(input.symbol).toUpperCase());
        if (input.side) qy = qy.eq("side", input.side);
        if (input.start_date) qy = qy.gte("trade_time", input.start_date);
        if (input.end_date) qy = qy.lte("trade_time", `${input.end_date}T23:59:59Z`);
        const { data, error } = await qy;
        if (error) return fail(error.message);
        return ok(data);
      }
      case "get_balances": {
        const { data, error } = await sb.from("account_balances").select("*").maybeSingle();
        if (error) return fail(error.message);
        return ok(data ?? { cash: 0, buying_power: 0, currency: "USD" });
      }
      case "list_watchlist": {
        const { data, error } = await sb.from("watchlist").select("*").order("created_at", { ascending: false });
        if (error) return fail(error.message);
        return ok(data);
      }
      case "get_quotes": {
        let qy = sb.from("market_equity_quotes").select("*");
        const tickers = input.tickers as string[] | undefined;
        if (tickers?.length) qy = qy.in("ticker", tickers.map((t) => t.toUpperCase()));
        const { data, error } = await qy;
        if (error) return fail(error.message);
        return ok(data);
      }
      case "get_market_overview": {
        const [idx, curve, bondQ] = await Promise.all([
          sb.from("market_indices").select("*"),
          sb.from("market_yield_curve").select("*"),
          sb.from("market_bond_quotes").select("*"),
        ]);
        return ok({ indices: idx.data ?? [], yield_curve: curve.data ?? [], bond_quotes: bondQ.data ?? [] });
      }
      case "get_price_history": {
        const symbol = String(input.symbol).toUpperCase();
        const end = String(input.end_date ?? new Date().toISOString().slice(0, 10));
        const start = String(
          input.start_date ?? new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10),
        );
        const { data, error } = await sb
          .from("price_history")
          .select("date, open, high, low, close")
          .eq("symbol", symbol)
          .gte("date", start)
          .lte("date", end)
          .order("date", { ascending: true })
          .limit(800);
        if (error) return fail(error.message);
        const rows = downsample(data ?? [], String(input.interval ?? "daily"));
        return ok({ symbol, interval: input.interval ?? "daily", count: rows.length, rows });
      }
      case "get_news": {
        const limit = Math.min(Number(input.limit ?? 20), 50);
        let qy = sb
          .from("news_cache")
          .select("symbol, headline, summary, source, datetime, url")
          .order("datetime", { ascending: false })
          .limit(limit);
        const symbols = input.symbols as string[] | undefined;
        if (symbols?.length) qy = qy.in("symbol", symbols.map((s) => s.toUpperCase()));
        const { data, error } = await qy;
        if (error) return fail(error.message);
        return ok(data);
      }
      case "list_income": {
        const [div, cashTx] = await Promise.all([
          sb.from("dividends").select("*").order("pay_date", { ascending: false }).limit(200),
          sb.from("cash_transactions").select("*").order("txn_date", { ascending: false }).limit(200),
        ]);
        return ok({ dividends: div.data ?? [], cash_transactions: cashTx.data ?? [] });
      }

      /* --------------------------- writes --------------------------- */
      case "add_equity": {
        const ticker = String(input.ticker).toUpperCase();
        const { data, error } = await sb
          .from("equity_holdings")
          .insert({
            ticker,
            shares: input.shares,
            cost_per_share: input.cost_per_share,
            purchase_date: input.purchase_date ?? null,
            notes: input.notes ?? null,
          })
          .select()
          .single();
        if (error) return fail(error.message);
        await registerInstrument(sb, "equity", ticker);
        return ok(data, [{ table: "equity_holdings", op: "insert", ids: [data.id] }]);
      }
      case "update_equity": {
        const patch: Record<string, unknown> = {};
        if (input.ticker !== undefined) patch.ticker = String(input.ticker).toUpperCase();
        if (input.shares !== undefined) patch.shares = input.shares;
        if (input.cost_per_share !== undefined) patch.cost_per_share = input.cost_per_share;
        if (input.purchase_date !== undefined) patch.purchase_date = input.purchase_date || null;
        if (input.notes !== undefined) patch.notes = input.notes || null;
        const { data, error } = await sb
          .from("equity_holdings")
          .update(patch)
          .eq("id", input.id)
          .select()
          .single();
        if (error) return fail(error.message);
        if (patch.ticker) await registerInstrument(sb, "equity", String(patch.ticker));
        return ok(data, [{ table: "equity_holdings", op: "update", ids: [String(input.id)] }]);
      }
      case "delete_equity": {
        const { error } = await sb.from("equity_holdings").delete().eq("id", input.id);
        if (error) return fail(error.message);
        return ok({ deleted: true, id: input.id }, [
          { table: "equity_holdings", op: "delete", ids: [String(input.id)] },
        ]);
      }
      case "add_bond": {
        const { data, error } = await sb
          .from("bond_holdings")
          .insert({
            bond_type: input.bond_type,
            identifier: input.identifier,
            name: input.name ?? null,
            face_value: input.face_value,
            quantity: input.quantity,
            purchase_price: input.purchase_price ?? null,
            purchase_yield: input.purchase_yield ?? null,
            coupon_rate: input.coupon_rate ?? null,
            maturity_date: input.maturity_date ?? null,
            rating: input.rating ?? null,
            purchase_date: input.purchase_date ?? null,
            notes: input.notes ?? null,
          })
          .select()
          .single();
        if (error) return fail(error.message);
        await registerInstrument(sb, "bond", String(input.identifier));
        return ok(data, [{ table: "bond_holdings", op: "insert", ids: [data.id] }]);
      }
      case "update_bond": {
        const patch: Record<string, unknown> = {};
        for (const k of [
          "bond_type",
          "identifier",
          "name",
          "face_value",
          "quantity",
          "purchase_price",
          "purchase_yield",
          "coupon_rate",
          "maturity_date",
          "rating",
          "purchase_date",
          "notes",
        ]) {
          if (input[k] !== undefined) patch[k] = input[k];
        }
        const { data, error } = await sb.from("bond_holdings").update(patch).eq("id", input.id).select().single();
        if (error) return fail(error.message);
        if (patch.identifier) await registerInstrument(sb, "bond", String(patch.identifier));
        return ok(data, [{ table: "bond_holdings", op: "update", ids: [String(input.id)] }]);
      }
      case "delete_bond": {
        const { error } = await sb.from("bond_holdings").delete().eq("id", input.id);
        if (error) return fail(error.message);
        return ok({ deleted: true, id: input.id }, [
          { table: "bond_holdings", op: "delete", ids: [String(input.id)] },
        ]);
      }
      case "add_transaction": {
        const { data, error } = await sb
          .from("transactions")
          .insert({
            symbol: String(input.symbol).toUpperCase(),
            asset_type: input.asset_type ?? "equity",
            side: input.side,
            quantity: input.quantity,
            price: input.price,
            commission: input.commission ?? 0,
            fees: input.fees ?? 0,
            trade_time: input.trade_time ?? new Date().toISOString(),
            realized_pnl: input.realized_pnl ?? null,
            notes: input.notes ?? null,
          })
          .select()
          .single();
        if (error) return fail(error.message);
        return ok(data, [{ table: "transactions", op: "insert", ids: [data.id] }]);
      }
      case "delete_transaction": {
        const { error } = await sb.from("transactions").delete().eq("id", input.id);
        if (error) return fail(error.message);
        return ok({ deleted: true, id: input.id }, [
          { table: "transactions", op: "delete", ids: [String(input.id)] },
        ]);
      }
      case "update_buying_power": {
        const { data: existing } = await sb.from("account_balances").select("user_id").maybeSingle();
        if (existing) {
          const patch: Record<string, unknown> = {
            buying_power: input.buying_power,
            updated_at: new Date().toISOString(),
          };
          if (input.cash !== undefined) patch.cash = input.cash;
          const { error } = await sb.from("account_balances").update(patch).eq("user_id", existing.user_id);
          if (error) return fail(error.message);
        } else {
          const { error } = await sb
            .from("account_balances")
            .insert({ buying_power: input.buying_power, cash: input.cash ?? input.buying_power });
          if (error) return fail(error.message);
        }
        return ok({ buying_power: input.buying_power, cash: input.cash }, [
          { table: "account_balances", op: "update", ids: [] },
        ]);
      }
      case "add_to_watchlist": {
        const sym = String(input.symbol).toUpperCase();
        const type = String(input.instrument_type ?? "equity");
        const { error } = await sb
          .from("watchlist")
          .upsert({ symbol: sym, instrument_type: type }, { onConflict: "user_id,symbol" });
        if (error) return fail(error.message);
        await registerInstrument(sb, type, sym);
        return ok({ added: sym }, [{ table: "watchlist", op: "insert", ids: [] }]);
      }
      case "remove_from_watchlist": {
        const sym = String(input.symbol).toUpperCase();
        const { error } = await sb.from("watchlist").delete().eq("symbol", sym);
        if (error) return fail(error.message);
        return ok({ removed: sym }, [{ table: "watchlist", op: "delete", ids: [] }]);
      }
      default:
        return fail(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

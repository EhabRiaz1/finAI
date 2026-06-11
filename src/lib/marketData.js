export function toEquityShape(row) {
  return {
    ticker: row.ticker,
    name: row.name ?? row.ticker,
    sector: row.sector ?? "—",
    price: Number(row.price ?? 0),
    prev: Number(row.prev_close ?? row.price ?? 0),
    beta: Number(row.beta ?? 0),
    mcap: Number(row.mcap_b ?? 0),
    pe: Number(row.pe ?? 0),
    div: Number(row.div_yield ?? 0),
    updatedAt: row.updated_at,
    source: row.source,
  };
}

export function toBondShape(row) {
  return {
    ticker: row.identifier,
    name: row.name ?? row.identifier,
    bondType: row.bond_type,
    yield: Number(row.yield ?? 0),
    bid: Number(row.bid ?? 0),
    ask: Number(row.ask ?? 0),
    dur: Number(row.duration ?? 0),
    rating: row.rating ?? "—",
    updatedAt: row.updated_at,
    source: row.source,
  };
}

export function toIndexShape(row) {
  return {
    name: row.name,
    price: Number(row.price ?? 0),
    chg: Number(row.change_pct ?? 0),
    updatedAt: row.updated_at,
  };
}

export function computeCurveSpreads(curve) {
  const get = (tenor) => curve.find((p) => p.tenor === tenor)?.yield;
  const y2 = get("2Y");
  const y3m = get("3M");
  const y10 = get("10Y");
  const y30 = get("30Y");
  const fmt = (bps) => {
    if (bps == null || !Number.isFinite(bps)) return "—";
    const sign = bps >= 0 ? "+" : "";
    return `${sign}${Math.round(bps)} bps`;
  };
  return {
    tenY2Y: y10 != null && y2 != null ? fmt((y10 - y2) * 100) : "—",
    thirtyY10Y: y30 != null && y10 != null ? fmt((y30 - y10) * 100) : "—",
    threeM10Y: y10 != null && y3m != null ? fmt((y10 - y3m) * 100) : "—",
  };
}

export function isStale(updatedAt, maxMinutes = 5) {
  if (!updatedAt) return true;
  return Date.now() - new Date(updatedAt).getTime() > maxMinutes * 60 * 1000;
}

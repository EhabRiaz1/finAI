import React, { useMemo, useState } from "react";
import { COLORS, fmtMoney, fmtMoney0, fmtNum, fmtPct, MONO, SERIF } from "../lib/theme";
import { Panel, PanelHeader, StatTile } from "../components/ui";
import AddPositionModal from "../components/AddPositionModal";
import { usePortfolioMetrics } from "../hooks/usePortfolioMetrics";
import { useChat } from "../ai/ChatProvider";

const actionBtn = {
  all: "unset",
  cursor: "pointer",
  fontFamily: MONO,
  fontSize: 9,
  letterSpacing: 1,
  padding: "4px 8px",
  border: `1px solid ${COLORS.borderHi}`,
  color: COLORS.textDim,
};

export default function Portfolio({ equities, holdings, transactions, onAddEquity, onUpdateEquity, onDeleteEquity, onAddTransaction, onRefresh, refreshing }) {
  const [tab, setTab] = useState("positions");
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const flashIds = useChat()?.flashIds; // rows the AI just changed

  const quotesByTicker = useMemo(() => new Map(equities.map((e) => [e.ticker, e])), [equities]);
  const { byTicker, portfolio } = usePortfolioMetrics(holdings);

  const rows = useMemo(() => {
    return holdings
      .map((h) => {
        const q = quotesByTicker.get(h.ticker);
        const price = q?.price ?? 0;
        const shares = Number(h.shares);
        const cost = Number(h.cost_per_share);
        const mv = price * shares;
        const cb = cost * shares;
        const pnl = mv - cb;
        const m = byTicker[h.ticker];
        return { ...h, sector: q?.sector ?? "—", shares, cost, price, mv, cb, pnl, pnlPct: cb ? (pnl / cb) * 100 : 0, beta: m?.beta ?? q?.beta ?? null, capm: m?.capm ?? null, sharpe: m?.sharpe ?? null };
      })
      .sort((a, b) => b.mv - a.mv);
  }, [holdings, quotesByTicker, byTicker]);

  const totalMV = rows.reduce((s, r) => s + r.mv, 0);
  const totalCB = rows.reduce((s, r) => s + r.cb, 0);
  const totalPnL = totalMV - totalCB;
  const realized = transactions.reduce((s, t) => s + Number(t.realized_pnl ?? 0), 0);

  async function handleSubmit(payload) {
    if (edit) {
      await onUpdateEquity(edit.id, {
        ticker: payload.ticker,
        shares: payload.shares,
        costPerShare: payload.costPerShare,
        purchaseDate: payload.purchaseDate,
        notes: payload.notes,
      });
    } else {
      await onAddEquity({
        ticker: payload.ticker,
        shares: payload.shares,
        costPerShare: payload.costPerShare,
        purchaseDate: payload.purchaseDate,
        notes: payload.notes,
      });
      if (payload.logTransaction) {
        await onAddTransaction({
          symbol: payload.ticker,
          side: payload.side,
          quantity: payload.shares,
          price: payload.costPerShare,
          commission: payload.commission,
          tradeTime: payload.purchaseDate ? new Date(payload.purchaseDate).toISOString() : new Date().toISOString(),
        });
      }
    }
    onRefresh?.();
  }

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontFamily: SERIF, fontSize: 28, color: COLORS.text }}>Portfolio</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => { setEdit(null); setModal(true); }} style={{ ...actionBtn, color: COLORS.amber, borderColor: COLORS.amberDim }}>+ POSITION</button>
          <button type="button" onClick={onRefresh} disabled={refreshing} style={actionBtn}>{refreshing ? "REFRESHING…" : "REFRESH PRICES"}</button>
        </div>
      </div>

      {/* Metric tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 10 }}>
        <StatTile label="Market Value" value={totalMV} change={totalCB ? (totalPnL / totalCB) * 100 : 0} />
        <StatTile label="Cost Basis" value={totalCB} />
        <StatTile label="Unrealized P&L" value={totalPnL} change={totalCB ? (totalPnL / totalCB) * 100 : 0} />
        <StatTile label="Realized P&L (YTD)" value={realized} prefix={realized >= 0 ? "+" : "-"} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        <MiniMetric label="Port Beta" value={fmtNum(portfolio?.beta, 2)} />
        <MiniMetric label="CAPM Exp. Return" value={portfolio?.capm != null ? `${(portfolio.capm * 100).toFixed(1)}%` : "—"} tone={COLORS.cyan} />
        <MiniMetric label="Sharpe" value={fmtNum(portfolio?.sharpe, 2)} />
        <MiniMetric label="Volatility" value={portfolio?.volatility != null ? `${(portfolio.volatility * 100).toFixed(1)}%` : "—"} />
        <MiniMetric label="Max Drawdown" value={portfolio?.maxDrawdown != null ? `${(portfolio.maxDrawdown * 100).toFixed(1)}%` : "—"} tone={COLORS.down} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {[["positions", "Positions"], ["transactions", "Transactions"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ all: "unset", cursor: "pointer", padding: "6px 14px", fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: tab === k ? COLORS.amber : COLORS.textDim, borderBottom: `2px solid ${tab === k ? COLORS.amber : "transparent"}` }}>
            {label.toUpperCase()}
          </button>
        ))}
      </div>

      {tab === "positions" ? (
        <Panel>
          <PanelHeader title="Holdings" right={`${rows.length} POSITIONS`} />
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 980 }}>
              <Grid header />
              {rows.map((r) => {
                const up = r.pnl >= 0;
                return (
                  <div key={r.id} style={flashIds?.has(r.id) ? { ...gridRow, animation: "fa-flash 2.4s ease-out" } : gridRow}>
                    <div style={{ color: COLORS.amber }}>{r.ticker}<div style={{ color: COLORS.textMute, fontSize: 9 }}>{r.sector}</div></div>
                    <div style={cell}>{r.shares.toLocaleString()}</div>
                    <div style={{ ...cell, color: COLORS.textDim }}>{fmtMoney(r.cost)}</div>
                    <div style={cell}>{fmtMoney(r.price)}</div>
                    <div style={cell}>{fmtMoney0(r.mv)}</div>
                    <div style={{ ...cell, color: up ? COLORS.up : COLORS.down }}>{up ? "+" : ""}{fmtMoney0(r.pnl)}</div>
                    <div style={{ ...cell, color: up ? COLORS.up : COLORS.down }}>{fmtPct(r.pnlPct)}</div>
                    <div style={{ ...cell, color: COLORS.textDim }}>{totalMV ? ((r.mv / totalMV) * 100).toFixed(1) : "0"}%</div>
                    <div style={cell}>{fmtNum(r.beta, 2)}</div>
                    <div style={{ ...cell, color: COLORS.cyan }}>{r.capm != null ? `${(r.capm * 100).toFixed(1)}%` : "—"}</div>
                    <div style={cell}>{fmtNum(r.sharpe, 2)}</div>
                    <div style={{ ...cell, display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button type="button" style={actionBtn} onClick={() => { setEdit(r); setModal(true); }}>ED</button>
                      <button type="button" style={{ ...actionBtn, color: COLORS.down }} onClick={() => onDeleteEquity(r.id)}>×</button>
                    </div>
                  </div>
                );
              })}
              {!rows.length && <div style={{ padding: 16, color: COLORS.textDim, fontSize: 13 }}>No positions. Click + POSITION to add one.</div>}
            </div>
          </div>
        </Panel>
      ) : (
        <Panel>
          <PanelHeader title="Transaction History" right={`${transactions.length} TRADES`} />
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.7fr 0.8fr 0.9fr 0.8fr 1fr", padding: "10px 16px", fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.2, borderBottom: `1px solid ${COLORS.border}` }}>
            <div>DATE</div><div>SYMBOL</div><div>SIDE</div><div style={{ textAlign: "right" }}>QTY</div><div style={{ textAlign: "right" }}>PRICE</div><div style={{ textAlign: "right" }}>COMM</div><div style={{ textAlign: "right" }}>REALIZED P&L</div>
          </div>
          {transactions.map((t) => (
            <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.7fr 0.8fr 0.9fr 0.8fr 1fr", padding: "10px 16px", fontFamily: MONO, fontSize: 12, borderBottom: `1px solid ${COLORS.border}`, ...(flashIds?.has(t.id) ? { animation: "fa-flash 2.4s ease-out" } : {}) }}>
              <div style={{ color: COLORS.textDim }}>{new Date(t.trade_time).toLocaleDateString("en-US", { year: "2-digit", month: "short", day: "2-digit" })}</div>
              <div style={{ color: COLORS.amber }}>{t.symbol}</div>
              <div style={{ color: t.side === "buy" ? COLORS.up : COLORS.down }}>{t.side.toUpperCase()}</div>
              <div style={{ textAlign: "right" }}>{Number(t.quantity).toLocaleString()}</div>
              <div style={{ textAlign: "right" }}>{fmtMoney(t.price)}</div>
              <div style={{ textAlign: "right", color: COLORS.textDim }}>{fmtMoney(Number(t.commission) + Number(t.fees))}</div>
              <div style={{ textAlign: "right", color: t.realized_pnl == null ? COLORS.textMute : Number(t.realized_pnl) >= 0 ? COLORS.up : COLORS.down }}>{t.realized_pnl == null ? "—" : `${Number(t.realized_pnl) >= 0 ? "+" : ""}${fmtMoney0(t.realized_pnl)}`}</div>
            </div>
          ))}
          {!transactions.length && <div style={{ padding: 16, color: COLORS.textDim, fontSize: 13 }}>No transactions yet.</div>}
        </Panel>
      )}

      {modal && (
        <AddPositionModal initial={edit} onClose={() => { setModal(false); setEdit(null); }} onSubmit={handleSubmit} />
      )}
    </div>
  );
}

const cell = { textAlign: "right", color: COLORS.text };
const gridTemplate = "1fr 0.7fr 0.8fr 0.8fr 0.9fr 0.9fr 0.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.7fr";
const gridRow = { display: "grid", gridTemplateColumns: gridTemplate, padding: "11px 16px", fontFamily: MONO, fontSize: 12, color: COLORS.text, borderBottom: `1px solid ${COLORS.border}`, alignItems: "center" };

function Grid({ header }) {
  if (!header) return null;
  const h = { textAlign: "right" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: gridTemplate, padding: "10px 16px", fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.2, borderBottom: `1px solid ${COLORS.border}` }}>
      <div>TICKER</div>
      <div style={h}>SHARES</div>
      <div style={h}>COST</div>
      <div style={h}>LAST</div>
      <div style={h}>MKT VAL</div>
      <div style={h}>P&L</div>
      <div style={h}>P&L%</div>
      <div style={h}>WT%</div>
      <div style={h}>BETA</div>
      <div style={h}>CAPM</div>
      <div style={h}>SHARPE</div>
      <div style={h}>ACT</div>
    </div>
  );
}

function MiniMetric({ label, value, tone }) {
  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, padding: "10px 12px" }}>
      <div style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.2, marginBottom: 4 }}>{label.toUpperCase()}</div>
      <div style={{ fontFamily: MONO, fontSize: 16, color: tone ?? COLORS.text }}>{value}</div>
    </div>
  );
}

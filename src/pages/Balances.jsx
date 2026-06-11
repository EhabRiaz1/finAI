import React, { useMemo, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { COLORS, fmtMoney, fmtMoney0, fmtPct, MONO, SANS, SERIF } from "../lib/theme";
import { Panel, PanelHeader } from "../components/ui";
import { useIncome } from "../hooks/useIncome";

export default function Balances({ equities, holdings, balances, onUpdateBuyingPower }) {
  const { dividends, cashFlows } = useIncome();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const quotesByTicker = useMemo(() => new Map(equities.map((e) => [e.ticker, e])), [equities]);

  const rows = useMemo(() => {
    return holdings
      .map((h) => {
        const q = quotesByTicker.get(h.ticker);
        const price = q?.price ?? 0;
        const mv = price * Number(h.shares);
        const cb = Number(h.cost_per_share) * Number(h.shares);
        return { ticker: h.ticker, sector: q?.sector ?? "—", shares: Number(h.shares), price, mv, cb, pnl: mv - cb };
      })
      .sort((a, b) => b.mv - a.mv);
  }, [holdings, quotesByTicker]);

  const investmentsMV = rows.reduce((s, r) => s + r.mv, 0);
  const cash = Number(balances?.cash ?? 0);
  const buyingPower = Number(balances?.buying_power ?? 0);
  const totalValue = investmentsMV + cash;

  // Sector allocation
  const sectors = useMemo(() => {
    const map = {};
    for (const r of rows) map[r.sector] = (map[r.sector] ?? 0) + r.mv;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const income = useMemo(() => {
    const divNet = dividends.reduce((s, d) => s + Number(d.net), 0);
    const divGross = dividends.reduce((s, d) => s + Number(d.gross), 0);
    const wht = dividends.reduce((s, d) => s + Number(d.withholding_tax), 0);
    const deposits = cashFlows.filter((c) => c.type === "deposit").reduce((s, c) => s + Number(c.amount), 0);
    const withdrawals = cashFlows.filter((c) => c.type === "withdrawal").reduce((s, c) => s + Number(c.amount), 0);
    return { divNet, divGross, wht, deposits, withdrawals };
  }, [dividends, cashFlows]);

  async function saveBuyingPower() {
    setSaving(true);
    try {
      await onUpdateBuyingPower(Number(draft));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>
      <div style={{ fontFamily: SERIF, fontSize: 28, color: COLORS.text, marginBottom: 18 }}>Balances</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        <BigStat label="Total Account Value" value={`$${fmtMoney(totalValue)}`} sub={`Investments + cash`} />
        <BigStat
          label="Buying Power"
          editable
          editing={editing}
          value={`$${fmtMoney(buyingPower)}`}
          draft={draft}
          onEdit={() => { setDraft(String(buyingPower)); setEditing(true); }}
          onChange={setDraft}
          onSave={saveBuyingPower}
          saving={saving}
          sub="Manually maintained"
        />
        <BigStat label="Cash" value={`$${fmtMoney(cash)}`} sub={`${balances?.currency ?? "USD"} settled`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14 }}>
        <Panel>
          <PanelHeader title="Investment Holdings" right={`$${fmtMoney0(investmentsMV)} · ${rows.length} POSITIONS`} />
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.9fr 1fr 0.8fr", padding: "10px 16px", fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.2, borderBottom: `1px solid ${COLORS.border}` }}>
            <div>TICKER</div><div style={{ textAlign: "right" }}>SHARES</div><div style={{ textAlign: "right" }}>LAST</div><div style={{ textAlign: "right" }}>MKT VAL</div><div style={{ textAlign: "right" }}>WT%</div>
          </div>
          {rows.map((r) => (
            <div key={r.ticker} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.9fr 1fr 0.8fr", padding: "10px 16px", fontFamily: MONO, fontSize: 12, borderBottom: `1px solid ${COLORS.border}` }}>
              <div style={{ color: COLORS.amber }}>{r.ticker}</div>
              <div style={{ textAlign: "right" }}>{r.shares.toLocaleString()}</div>
              <div style={{ textAlign: "right", color: COLORS.textDim }}>{fmtMoney(r.price)}</div>
              <div style={{ textAlign: "right" }}>{fmtMoney0(r.mv)}</div>
              <div style={{ textAlign: "right", color: COLORS.textDim }}>{totalValue ? ((r.mv / totalValue) * 100).toFixed(1) : "0"}%</div>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.9fr 1fr 0.8fr", padding: "10px 16px", fontFamily: MONO, fontSize: 12, color: COLORS.textDim, background: COLORS.panelHi }}>
            <div>CASH</div><div /><div /><div style={{ textAlign: "right" }}>{fmtMoney0(cash)}</div><div style={{ textAlign: "right" }}>{totalValue ? ((cash / totalValue) * 100).toFixed(1) : "0"}%</div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Allocation by Sector" />
          <div style={{ padding: 14 }}>
            {sectors.map(([sector, mv]) => {
              const pct = investmentsMV ? (mv / investmentsMV) * 100 : 0;
              return (
                <div key={sector} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 12, color: COLORS.textDim, marginBottom: 4 }}>
                    <span>{sector}</span>
                    <span style={{ fontFamily: MONO, color: COLORS.text }}>{pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 6, background: COLORS.border }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: COLORS.amber }} />
                  </div>
                </div>
              );
            })}
            {!sectors.length && <div style={{ color: COLORS.textDim, fontSize: 13 }}>No holdings.</div>}
          </div>
        </Panel>
      </div>

      {/* Income & cash flow */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 20, marginBottom: 14 }}>
        <SmallStat label="Dividends (Net YTD)" value={`+$${fmtMoney(income.divNet)}`} tone={COLORS.up} />
        <SmallStat label="Dividends (Gross)" value={`$${fmtMoney(income.divGross)}`} />
        <SmallStat label="Withholding Tax" value={`-$${fmtMoney(income.wht)}`} tone={COLORS.down} />
        <SmallStat label="Net Deposits YTD" value={`$${fmtMoney0(income.deposits + income.withdrawals)}`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Panel>
          <PanelHeader title="Dividend Income" right={`${dividends.length} PAYMENTS`} />
          <div style={{ display: "grid", gridTemplateColumns: "0.9fr 0.8fr 0.7fr 0.9fr 0.9fr", padding: "10px 16px", fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.2, borderBottom: `1px solid ${COLORS.border}` }}>
            <div>DATE</div><div>SYMBOL</div><div style={{ textAlign: "right" }}>RATE</div><div style={{ textAlign: "right" }}>GROSS</div><div style={{ textAlign: "right" }}>NET</div>
          </div>
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            {dividends.map((d) => (
              <div key={d.id} style={{ display: "grid", gridTemplateColumns: "0.9fr 0.8fr 0.7fr 0.9fr 0.9fr", padding: "9px 16px", fontFamily: MONO, fontSize: 12, borderBottom: `1px solid ${COLORS.border}` }}>
                <div style={{ color: COLORS.textDim }}>{new Date(d.pay_date).toLocaleDateString("en-US", { month: "short", day: "2-digit" })}</div>
                <div style={{ color: COLORS.amber }}>{d.symbol}</div>
                <div style={{ textAlign: "right", color: COLORS.textDim }}>{Number(d.per_share).toFixed(2)}</div>
                <div style={{ textAlign: "right" }}>{fmtMoney(d.gross)}</div>
                <div style={{ textAlign: "right", color: COLORS.up }}>{fmtMoney(d.net)}</div>
              </div>
            ))}
            {!dividends.length && <div style={{ padding: 16, color: COLORS.textDim, fontSize: 13 }}>No dividends recorded.</div>}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Cash Flow" right={`${cashFlows.length} ENTRIES`} />
          <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.6fr 1fr", padding: "10px 16px", fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.2, borderBottom: `1px solid ${COLORS.border}` }}>
            <div>DATE</div><div>DESCRIPTION</div><div style={{ textAlign: "right" }}>AMOUNT</div>
          </div>
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            {cashFlows.map((c) => {
              const pos = Number(c.amount) >= 0;
              return (
                <div key={c.id} style={{ display: "grid", gridTemplateColumns: "0.8fr 1.6fr 1fr", padding: "9px 16px", fontFamily: MONO, fontSize: 12, borderBottom: `1px solid ${COLORS.border}` }}>
                  <div style={{ color: COLORS.textDim }}>{new Date(c.txn_date).toLocaleDateString("en-US", { month: "short", day: "2-digit" })}</div>
                  <div style={{ color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{c.description}</div>
                  <div style={{ textAlign: "right", color: pos ? COLORS.up : COLORS.down }}>{pos ? "+" : ""}{fmtMoney0(c.amount)}</div>
                </div>
              );
            })}
            {!cashFlows.length && <div style={{ padding: 16, color: COLORS.textDim, fontSize: 13 }}>No cash flow entries.</div>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SmallStat({ label, value, tone }) {
  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, padding: "12px 14px" }}>
      <div style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.2, marginBottom: 5 }}>{label.toUpperCase()}</div>
      <div style={{ fontFamily: MONO, fontSize: 17, color: tone ?? COLORS.text }}>{value}</div>
    </div>
  );
}

function BigStat({ label, value, sub, editable, editing, draft, onEdit, onChange, onSave, saving }) {
  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.5 }}>{label.toUpperCase()}</div>
        {editable && !editing && (
          <button onClick={onEdit} style={{ all: "unset", cursor: "pointer", color: COLORS.textDim }}><Pencil size={13} /></button>
        )}
      </div>
      {editable && editing ? (
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
          <input
            autoFocus
            type="number"
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            style={{ flex: 1, background: COLORS.bg, border: `1px solid ${COLORS.amberDim}`, color: COLORS.text, fontFamily: MONO, fontSize: 20, padding: "6px 8px", outline: "none", width: "100%" }}
          />
          <button onClick={onSave} disabled={saving} style={{ all: "unset", cursor: "pointer", color: COLORS.amber, border: `1px solid ${COLORS.amberDim}`, padding: 8, display: "flex" }}>
            <Check size={16} />
          </button>
        </div>
      ) : (
        <div style={{ fontFamily: MONO, fontSize: 28, color: COLORS.text, marginTop: 8 }}>{value}</div>
      )}
      <div style={{ fontFamily: SANS, fontSize: 11, color: COLORS.textDim, marginTop: 6 }}>{sub}</div>
    </div>
  );
}

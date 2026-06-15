import React from "react";
import {
  Activity,
  Bot,
  Briefcase,
  Circle,
  LayoutDashboard,
  Landmark,
  LogOut,
  Newspaper,
  Search,
  Shield,
  Wallet,
} from "lucide-react";
import { COLORS, fmtMoney, fmtPct, MONO, SANS, SERIF } from "../lib/theme";
import { useChat } from "../ai/ChatProvider";

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "portfolio", label: "Portfolio", icon: Briefcase },
  { key: "bonds", label: "Bonds", icon: Landmark },
  { key: "balances", label: "Balances", icon: Wallet },
  { key: "research", label: "Research", icon: Search },
  { key: "news", label: "Portfolio News", icon: Newspaper },
  { key: "ai", label: "AI Analyst", icon: Bot },
];

export function TopBar({ now, lastUpdated, refreshing, email, name, onSignOut }) {
  const feedLabel = refreshing ? "REFRESHING" : "LIVE · FINNHUB";
  const displayName = name || email || "";
  const initial = (displayName?.[0] ?? "O").toUpperCase();
  const chat = useChat(); // null outside ChatProvider (e.g. login screen)
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 18px",
        borderBottom: `1px solid ${COLORS.border}`,
        background: COLORS.bg,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ fontFamily: SERIF, fontSize: 24, fontStyle: "italic", color: COLORS.text }}>
          Finance<span style={{ color: COLORS.amber, fontStyle: "normal" }}> AI</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 9, padding: "3px 7px", border: `1px solid ${COLORS.amberDim}`, color: COLORS.amber, letterSpacing: 1.5 }}>
          v1.0 · LIVE
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: MONO, fontSize: 11, color: COLORS.textDim }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Circle size={7} fill={COLORS.up} stroke="none" />
          <span style={{ color: COLORS.up, letterSpacing: 1 }}>NYSE OPEN</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Circle size={7} fill={refreshing ? COLORS.amber : COLORS.cyan} stroke="none" />
          <span style={{ color: refreshing ? COLORS.amber : COLORS.cyan, letterSpacing: 1 }}>{feedLabel}</span>
        </div>
        {lastUpdated && (
          <div style={{ color: COLORS.textMute, fontSize: 10 }}>
            UPD {new Date(lastUpdated).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </div>
        )}
        <div style={{ color: COLORS.text, letterSpacing: 1 }}>
          {now.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} ET
        </div>
        {chat && (
          <button
            onClick={() => chat.setPanelOpen((v) => !v)}
            title="Finance AI (⌘J)"
            style={{
              all: "unset",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              border: `1px solid ${chat.panelOpen ? COLORS.amber : COLORS.amberDim}`,
              color: COLORS.amber,
              fontSize: 9,
              letterSpacing: 1.5,
              background: chat.panelOpen ? "rgba(245,165,36,0.08)" : "transparent",
            }}
          >
            <Bot size={13} strokeWidth={1.5} /> ASK AI
          </button>
        )}
        {displayName && (
          <span style={{ fontFamily: SANS, fontSize: 12, color: COLORS.text, letterSpacing: 0.3, whiteSpace: "nowrap" }}>{displayName}</span>
        )}
        <div title={email} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${COLORS.borderHi}`, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.amber, fontFamily: SERIF, fontSize: 14 }}>
          {initial}
        </div>
        <button onClick={onSignOut} title="Sign out" style={{ all: "unset", cursor: "pointer", color: COLORS.textDim, display: "flex", alignItems: "center" }}>
          <LogOut size={15} />
        </button>
      </div>
    </div>
  );
}

export function TickerTape({ equities }) {
  const items = [...equities, ...equities];
  if (!equities.length) {
    return <div style={{ height: 32, borderBottom: `1px solid ${COLORS.border}`, background: COLORS.panel }} />;
  }
  return (
    <div style={{ overflow: "hidden", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.panel, height: 32, position: "relative" }}>
      <div style={{ display: "flex", gap: 26, alignItems: "center", whiteSpace: "nowrap", height: "100%", paddingLeft: 18, animation: "fa-marquee 120s linear infinite", fontFamily: MONO, fontSize: 11 }}>
        {items.map((s, i) => {
          const chg = s.prev ? ((s.price - s.prev) / s.prev) * 100 : 0;
          const up = chg >= 0;
          return (
            <span key={`${s.ticker}-${i}`} style={{ display: "inline-flex", gap: 8 }}>
              <span style={{ color: COLORS.text, fontWeight: 500 }}>{s.ticker}</span>
              <span style={{ color: COLORS.textDim }}>{fmtMoney(s.price)}</span>
              <span style={{ color: up ? COLORS.up : COLORS.down }}>{up ? "▲" : "▼"} {fmtPct(chg)}</span>
              <span style={{ color: COLORS.textMute }}>|</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar({ active, setActive, isAdmin }) {
  const nav = isAdmin ? [...NAV, { key: "admin", label: "Admin", icon: Shield }] : NAV;
  return (
    <div style={{ width: 200, borderRight: `1px solid ${COLORS.border}`, background: COLORS.bg, display: "flex", flexDirection: "column", padding: "16px 0" }}>
      <div style={{ padding: "0 18px 14px", fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 2 }}>
        WORKSPACE
      </div>
      {nav.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => setActive(key)}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 18px",
              fontFamily: SANS,
              fontSize: 13,
              fontWeight: isActive ? 500 : 400,
              color: isActive ? COLORS.amber : COLORS.textDim,
              borderLeft: isActive ? `2px solid ${COLORS.amber}` : "2px solid transparent",
              background: isActive ? "rgba(245,165,36,0.05)" : "transparent",
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = COLORS.text; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = COLORS.textDim; }}
          >
            <Icon size={15} strokeWidth={1.6} />
            <span>{label}</span>
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      <div style={{ padding: "12px 18px", borderTop: `1px solid ${COLORS.border}`, fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.2, lineHeight: 1.7 }}>
        <Landmark size={11} style={{ verticalAlign: "middle", marginRight: 5 }} />
        HSBC · IBKR LINKED
        <br />
        <span style={{ color: COLORS.up }}>● PORTFOLIO SYNCED</span>
      </div>
    </div>
  );
}

export function StatusBar({ lastUpdated, refreshing, totalValue }) {
  const tickLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : "—";
  return (
    <div style={{ height: 26, borderTop: `1px solid ${COLORS.border}`, background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.5 }}>
      <div style={{ display: "flex", gap: 18 }}>
        <span><Activity size={9} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} color={COLORS.up} /> {refreshing ? "REFRESHING" : "LIVE · FINNHUB"}</span>
        <span>SUPABASE · RLS ON</span>
        <span>LAST REFRESH {tickLabel}</span>
        {totalValue != null && <span>NAV ${fmtMoney(totalValue)}</span>}
      </div>
      <div>FINANCE AI · OMER YAHYA</div>
    </div>
  );
}

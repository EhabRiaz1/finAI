import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AuthProvider, useAuth } from "./src/auth/AuthProvider";
import LoginScreen from "./src/components/LoginScreen";
import WelcomeIntro from "./src/components/WelcomeIntro";
import { Sidebar, StatusBar, TickerTape, TopBar } from "./src/components/Chrome";
import Dashboard from "./src/pages/Dashboard";
import Portfolio from "./src/pages/Portfolio";
import Bonds from "./src/pages/Bonds";
import Balances from "./src/pages/Balances";
import Research from "./src/pages/Research";
import PortfolioNews from "./src/pages/PortfolioNews";
import AIAnalyst from "./src/pages/AIAnalyst";
import { useMarketData } from "./src/hooks/useMarketData";
import { useHoldings } from "./src/hooks/useHoldings";
import { useBalances } from "./src/hooks/useBalances";
import { useTransactions } from "./src/hooks/useTransactions";
import { useWatchlist } from "./src/hooks/useWatchlist";
import { ChatProvider } from "./src/ai/ChatProvider";
import ChatPanel from "./src/ai/ChatPanel";
import { COLORS, FONTS, MONO, SERIF } from "./src/lib/theme";

/* ------------------------------------------------------------------
   FINANCE AI — Institutional Asset Management Terminal
   v1.0 · Supabase auth + RLS · live Finnhub feeds · portfolio-aware AI
   ------------------------------------------------------------------ */

function Terminal() {
  const { user, signOut } = useAuth();
  const [active, setActive] = useState("dashboard");
  const [selected, setSelected] = useState(null);
  const [now, setNow] = useState(new Date());

  const { equities, indices, lastUpdated, refreshing, refresh } = useMarketData();
  const { equityHoldings, bondHoldings, addEquity, updateEquity, deleteEquity, addBond, reload: reloadHoldings } = useHoldings();
  const { balances, updateBuyingPower, reload: reloadBalances } = useBalances();
  const { transactions, add: addTransaction, reload: reloadTransactions } = useTransactions();
  const watchlist = useWatchlist();

  // AI edits land in Supabase via the edge function; this refreshes the
  // affected tables in the UI when the assistant reports a change.
  const handleDataChanged = useCallback(
    (changes) => {
      for (const c of changes ?? []) {
        if (c.table === "equity_holdings" || c.table === "bond_holdings") reloadHoldings();
        else if (c.table === "transactions") reloadTransactions();
        else if (c.table === "account_balances") reloadBalances();
        else if (c.table === "watchlist") watchlist.reload();
      }
    },
    [reloadHoldings, reloadTransactions, reloadBalances, watchlist.reload],
  );

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const quotesByTicker = useMemo(() => new Map(equities.map((e) => [e.ticker, e])), [equities]);
  const totalValue = useMemo(() => {
    const mv = equityHoldings.reduce((s, h) => s + (quotesByTicker.get(h.ticker)?.price ?? 0) * Number(h.shares), 0);
    const bondMv = bondHoldings.reduce((s, b) => s + Number(b.face_value ?? 0) * Number(b.quantity ?? 0) * (Number(b.purchase_price ?? 100) / 100), 0);
    return mv + bondMv + Number(balances?.cash ?? 0);
  }, [equityHoldings, bondHoldings, quotesByTicker, balances]);

  return (
    <ChatProvider onDataChanged={handleDataChanged}>
    <div style={{ background: COLORS.bg, color: COLORS.text, height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'IBM Plex Sans', sans-serif", overflow: "hidden" }}>
      <style>{`
        ${FONTS}
        @keyframes fa-marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes fa-pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.1); } }
        @keyframes fa-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes fa-flash { 0% { background-color: rgba(245,165,36,0.22); } 100% { background-color: transparent; } }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: ${COLORS.bg}; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.border}; }
        ::-webkit-scrollbar-thumb:hover { background: ${COLORS.borderHi}; }
        body { margin: 0; }
      `}</style>

      <TopBar now={now} lastUpdated={lastUpdated} refreshing={refreshing} email={user?.email} name={user?.user_metadata?.full_name || user?.user_metadata?.name} onSignOut={signOut} />
      <TickerTape equities={equities} />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <Sidebar active={active} setActive={setActive} />
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {active === "dashboard" && (
            <Dashboard
              equities={equities}
              indices={indices}
              holdings={equityHoldings}
              balances={balances}
              watchlist={watchlist}
              setActive={setActive}
              setSelected={setSelected}
            />
          )}
          {active === "portfolio" && (
            <Portfolio
              equities={equities}
              holdings={equityHoldings}
              transactions={transactions}
              onAddEquity={addEquity}
              onUpdateEquity={updateEquity}
              onDeleteEquity={deleteEquity}
              onAddTransaction={addTransaction}
              onRefresh={refresh}
              refreshing={refreshing}
            />
          )}
          {active === "bonds" && (
            <Bonds bonds={bondHoldings} onAddBond={addBond} onRefresh={refresh} />
          )}
          {active === "balances" && (
            <Balances equities={equities} holdings={equityHoldings} balances={balances} onUpdateBuyingPower={updateBuyingPower} />
          )}
          {active === "research" && (
            <Research equities={equities} holdings={equityHoldings} watchlist={watchlist} selected={selected} setSelected={setSelected} />
          )}
          {active === "news" && <PortfolioNews holdings={equityHoldings} equities={equities} />}
          {active === "ai" && <AIAnalyst />}
        </div>
      </div>

      <StatusBar lastUpdated={lastUpdated} refreshing={refreshing} totalValue={totalValue} />
      <ChatPanel onOpenFullPage={() => setActive("ai")} />
    </div>
    </ChatProvider>
  );
}

function Gate() {
  const { session, loading } = useAuth();
  const [introDone, setIntroDone] = useState(false);

  // Replay the welcome on the next sign-in after a sign-out.
  useEffect(() => {
    if (!session) setIntroDone(false);
  }, [session]);

  if (loading) {
    return (
      <div style={{ height: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{FONTS}</style>
        <div style={{ fontFamily: SERIF, fontSize: 28, fontStyle: "italic", color: COLORS.text }}>
          Finance<span style={{ color: COLORS.amber, fontStyle: "normal" }}> AI</span>
          <div style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 2, marginTop: 8, textAlign: "center" }}>LOADING…</div>
        </div>
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  const meta = session.user?.user_metadata ?? {};
  const welcomeName = meta.full_name || meta.name || session.user?.email?.split("@")[0] || "back";

  return (
    <>
      <Terminal />
      {!introDone && <WelcomeIntro name={welcomeName} onDone={() => setIntroDone(true)} />}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

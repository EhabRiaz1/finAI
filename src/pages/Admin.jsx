import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, MessageSquare, RefreshCw, Search, Shield, UserPlus, Wallet, X } from "lucide-react";
import { COLORS, fmtMoney, MONO, SANS, SERIF } from "../lib/theme";
import { Panel, PanelHeader } from "../components/ui";
import MarkdownMessage from "../ai/MarkdownMessage";
import { adminCall } from "../admin/adminClient";

/* ------------------------------------------------------------------
   ADMIN / MASTER PORTAL — searchable account rail on the left; the
   selected account's AI chats and portfolio on the right. All data
   comes through the service-role admin-api edge function.
   ------------------------------------------------------------------ */

function extractText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "chats", label: "Has chats" },
  { key: "holdings", label: "Has holdings" },
];
const SORTS = [
  { key: "activity", label: "Last activity" },
  { key: "chats", label: "Most chats" },
  { key: "holdings", label: "Most holdings" },
  { key: "email", label: "Email A–Z" },
];

export default function Admin() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // Account rail controls
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("activity");
  const [selectedId, setSelectedId] = useState(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { accounts } = await adminCall("list_accounts");
      setAccounts(accounts ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = accounts.filter((a) => {
      if (q && !(`${a.email ?? ""} ${a.name ?? ""}`.toLowerCase().includes(q))) return false;
      if (filter === "chats" && !a.conversation_count) return false;
      if (filter === "holdings" && !a.holding_count) return false;
      return true;
    });
    const cmp = {
      activity: (a, b) => (b.last_activity ?? "").localeCompare(a.last_activity ?? ""),
      chats: (a, b) => b.conversation_count - a.conversation_count,
      holdings: (a, b) => b.holding_count - a.holding_count,
      email: (a, b) => (a.email ?? "").localeCompare(b.email ?? ""),
    }[sort];
    return [...list].sort(cmp);
  }, [accounts, query, filter, sort]);

  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Shield size={18} color={COLORS.amber} strokeWidth={1.6} />
          <div style={{ fontFamily: SERIF, fontSize: 22, color: COLORS.text }}>Master Portal</div>
          <div style={{ fontFamily: MONO, fontSize: 9, padding: "3px 8px", border: `1px solid ${COLORS.amberDim}`, color: COLORS.amber, letterSpacing: 1.5 }}>
            ADMIN · SERVICE ROLE
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <HeaderBtn onClick={() => setCreating(true)}><UserPlus size={12} /> NEW ACCOUNT</HeaderBtn>
          <HeaderBtn onClick={loadAccounts}><RefreshCw size={12} /> REFRESH</HeaderBtn>
        </div>
      </div>

      {error && <div style={{ color: COLORS.down, fontFamily: SANS, fontSize: 12.5, padding: "10px 20px" }}>⚠︎ {error}</div>}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left rail: searchable / filterable accounts */}
        <div style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${COLORS.border}`, padding: "7px 10px" }}>
              <Search size={13} color={COLORS.textMute} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search email or name…"
                style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: COLORS.text, fontFamily: MONO, fontSize: 12, outline: "none" }}
              />
              {query && <X size={13} color={COLORS.textMute} style={{ cursor: "pointer" }} onClick={() => setQuery("")} />}
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {FILTERS.map((f) => (
                <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</Chip>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1 }}>SORT</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                style={{ flex: 1, background: COLORS.panel, border: `1px solid ${COLORS.border}`, color: COLORS.textDim, fontFamily: MONO, fontSize: 10, padding: "5px 8px", outline: "none" }}
              >
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {loading && <div style={{ padding: 14, fontFamily: MONO, fontSize: 10, color: COLORS.textMute }}>LOADING…</div>}
            {!loading && !visible.length && <div style={{ padding: 14, fontFamily: SANS, fontSize: 12.5, color: COLORS.textDim }}>No matching accounts.</div>}
            {visible.map((a) => {
              const isSel = a.id === selectedId;
              return (
                <div
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  style={{ padding: "11px 14px", cursor: "pointer", borderBottom: `1px solid ${COLORS.border}`, background: isSel ? "rgba(245,165,36,0.07)" : "transparent", borderLeft: isSel ? `2px solid ${COLORS.amber}` : "2px solid transparent" }}
                  onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = COLORS.panelHi; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ fontFamily: MONO, fontSize: 12, color: isSel ? COLORS.amber : COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.email}</div>
                  {a.name && <div style={{ fontFamily: SANS, fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>{a.name}</div>}
                  <div style={{ display: "flex", gap: 12, marginTop: 5, fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 0.5 }}>
                    <span>{a.conversation_count} CHATS</span>
                    <span>{a.holding_count} HOLDINGS</span>
                    <span style={{ marginLeft: "auto" }}>{fmtDate(a.last_activity)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${COLORS.border}`, fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1 }}>
            {visible.length} / {accounts.length} ACCOUNTS
          </div>
        </div>

        {/* Right pane: selected account detail */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto" }}>
          {selected ? (
            <AccountDetail account={selected} />
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textDim, fontFamily: SANS, fontSize: 14 }}>
              Select an account to view its chats and portfolio.
            </div>
          )}
        </div>
      </div>

      {creating && <CreateAccountModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); loadAccounts(); }} />}
    </div>
  );
}

function AccountDetail({ account }) {
  const [tab, setTab] = useState("chats"); // chats | portfolio
  const [conversations, setConversations] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [openConvo, setOpenConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Reset when the selected account changes.
  useEffect(() => {
    setTab("chats");
    setConversations(null);
    setPortfolio(null);
    setOpenConvo(null);
    setMessages([]);
    setError("");
  }, [account.id]);

  const loadConversations = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const { conversations } = await adminCall("get_conversations", { userId: account.id });
      setConversations(conversations ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [account.id]);

  const loadPortfolio = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const data = await adminCall("get_portfolio", { userId: account.id });
      setPortfolio(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [account.id]);

  useEffect(() => {
    if (tab === "chats" && conversations === null) loadConversations();
    if (tab === "portfolio" && portfolio === null) loadPortfolio();
  }, [tab, conversations, portfolio, loadConversations, loadPortfolio]);

  async function openTranscript(c) {
    setBusy(true);
    setError("");
    try {
      const { messages } = await adminCall("get_messages", { conversationId: c.id });
      setMessages(messages ?? []);
      setOpenConvo(c);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 18 }}>
      {/* Account header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 24, color: COLORS.text }}>{account.email}</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>
            {account.name ? `${account.name} · ` : ""}{account.conversation_count} chats · {account.holding_count} holdings · last active {fmtDate(account.last_activity)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["chats", "CHATS"], ["portfolio", "PORTFOLIO"]].map(([k, label]) => (
          <button
            key={k}
            onClick={() => { setTab(k); setOpenConvo(null); }}
            style={{ all: "unset", cursor: "pointer", padding: "6px 14px", fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: tab === k ? COLORS.amber : COLORS.textDim, border: `1px solid ${tab === k ? COLORS.amberDim : COLORS.border}` }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div style={{ color: COLORS.down, fontFamily: SANS, fontSize: 12.5, marginBottom: 12 }}>⚠︎ {error}</div>}
      {busy && <div style={{ fontFamily: MONO, fontSize: 10, color: COLORS.textMute, marginBottom: 10 }}>LOADING…</div>}

      {tab === "chats" && !openConvo && (
        <Panel>
          <PanelHeader title="Conversations" right={`${conversations?.length ?? 0} CHATS`} />
          {(conversations ?? []).map((c) => (
            <div
              key={c.id}
              onClick={() => openTranscript(c)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${COLORS.border}`, cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.panelHi)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ fontFamily: SANS, fontSize: 13, color: COLORS.text }}>{c.title || "Untitled"}</div>
              <div style={{ display: "flex", gap: 16, fontFamily: MONO, fontSize: 10, color: COLORS.textMute }}>
                <span>{c.message_count} MSGS</span>
                <span>{fmtDate(c.updated_at)}</span>
              </div>
            </div>
          ))}
          {conversations !== null && !conversations.length && <div style={{ padding: 16, color: COLORS.textDim, fontFamily: SANS, fontSize: 13 }}>No conversations for this user.</div>}
        </Panel>
      )}

      {tab === "chats" && openConvo && (
        <>
          <button
            onClick={() => setOpenConvo(null)}
            style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: COLORS.textDim }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.amber)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}
          >
            <ArrowLeft size={13} /> BACK TO CONVERSATIONS
          </button>
          <Transcript title={openConvo.title || "Transcript"} messages={messages} />
        </>
      )}

      {tab === "portfolio" && <PortfolioView portfolio={portfolio} />}
    </div>
  );
}

function Chip({ children, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ all: "unset", cursor: "pointer", padding: "4px 10px", fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: active ? COLORS.amber : COLORS.textDim, border: `1px solid ${active ? COLORS.amberDim : COLORS.border}` }}
    >
      {children}
    </button>
  );
}

function HeaderBtn({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", border: `1px solid ${COLORS.amberDim}`, color: COLORS.amber, fontFamily: MONO, fontSize: 9, letterSpacing: 1.2 }}
    >
      {children}
    </button>
  );
}

function Transcript({ title, messages }) {
  const visible = messages
    .map((m) => ({ ...m, text: extractText(m.content) }))
    .filter((m) => m.text.trim());
  return (
    <Panel>
      <PanelHeader title={title} right="READ-ONLY" />
      <div style={{ padding: "16px 18px" }}>
        {visible.map((m) => (
          <div key={m.seq} style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${m.role === "user" ? COLORS.borderHi : COLORS.amberDim}`, color: m.role === "user" ? COLORS.text : COLORS.amber, fontFamily: m.role === "user" ? SERIF : MONO, fontSize: 11 }}>
              {m.role === "user" ? "U" : "AI"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {m.role === "user" ? (
                <div style={{ fontFamily: SANS, fontSize: 13.5, color: COLORS.text, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
              ) : (
                <MarkdownMessage text={m.text} />
              )}
            </div>
          </div>
        ))}
        {!visible.length && <div style={{ color: COLORS.textDim, fontFamily: SANS, fontSize: 13 }}>No readable messages.</div>}
      </div>
    </Panel>
  );
}

function PortfolioView({ portfolio }) {
  if (!portfolio) return null;
  const { equity_holdings = [], bond_holdings = [], transactions = [], account_balances } = portfolio;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel>
        <PanelHeader title="Equity Holdings" right={account_balances ? `CASH $${fmtMoney(Number(account_balances.cash ?? 0))}` : "NO BALANCE"} />
        <SimpleTable
          columns={["TICKER", "SHARES", "COST/SHARE", "PURCHASE DATE"]}
          rows={equity_holdings.map((h) => [h.ticker, Number(h.shares).toLocaleString(), fmtMoney(Number(h.cost_per_share ?? 0)), h.purchase_date ?? "—"])}
          empty="No equity holdings."
        />
      </Panel>
      <Panel>
        <PanelHeader title="Bonds" right={`${bond_holdings.length} HOLDINGS`} />
        <SimpleTable
          columns={["ISIN", "NAME", "COUPON", "MATURITY"]}
          rows={bond_holdings.map((b) => [b.identifier, b.name ?? "—", b.coupon_rate != null ? `${Number(b.coupon_rate).toFixed(2)}%` : "—", b.maturity_date ?? "—"])}
          empty="No bonds."
        />
      </Panel>
      <Panel>
        <PanelHeader title="Transactions" right={`${transactions.length} TXNS`} />
        <SimpleTable
          columns={["DATE", "SIDE", "TICKER", "SHARES", "PRICE"]}
          rows={transactions.slice(0, 100).map((t) => [
            fmtDate(t.created_at ?? t.txn_date),
            (t.side ?? t.type ?? "—").toUpperCase(),
            t.ticker ?? "—",
            t.shares != null ? Number(t.shares).toLocaleString() : "—",
            t.price != null ? fmtMoney(Number(t.price)) : "—",
          ])}
          empty="No transactions."
        />
      </Panel>
    </div>
  );
}

function SimpleTable({ columns, rows, empty }) {
  const tmpl = `repeat(${columns.length}, 1fr)`;
  const head = { fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1.2, padding: "10px 16px" };
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 600 }}>
        <div style={{ display: "grid", gridTemplateColumns: tmpl, ...head, borderBottom: `1px solid ${COLORS.border}` }}>
          {columns.map((c) => <div key={c}>{c}</div>)}
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: tmpl, padding: "10px 16px", fontFamily: MONO, fontSize: 12, color: COLORS.text, borderBottom: `1px solid ${COLORS.border}` }}>
            {r.map((cell, j) => <div key={j} style={{ color: j === 0 ? COLORS.text : COLORS.textDim }}>{cell}</div>)}
          </div>
        ))}
        {!rows.length && <div style={{ padding: 14, color: COLORS.textDim, fontFamily: SANS, fontSize: 12.5 }}>{empty}</div>}
      </div>
    </div>
  );
}

function CreateAccountModal({ onClose, onCreated }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const input = { width: "100%", padding: "10px 12px", background: COLORS.bg, border: `1px solid ${COLORS.borderHi}`, color: COLORS.text, fontFamily: MONO, fontSize: 12, boxSizing: "border-box" };
  const label = { display: "block", fontFamily: MONO, fontSize: 9, color: COLORS.textDim, letterSpacing: 1.2, marginBottom: 6, textTransform: "uppercase" };

  async function submit(e) {
    e.preventDefault();
    setError("");
    setOk("");
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setSaving(true);
    try {
      const { user } = await adminCall("create_account", { email: email.trim(), password, name: name.trim() });
      setOk(`Created ${user?.email}.`);
      setTimeout(onCreated, 800);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.borderHi}`, width: 440, maxWidth: "92vw", padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontFamily: SERIF, fontSize: 22, color: COLORS.text }}>Create Account</div>
          <button type="button" onClick={onClose} style={{ all: "unset", cursor: "pointer", color: COLORS.textDim }}><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 14 }}>
            <label style={label}>Email</label>
            <input style={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={label}>Password</label>
            <input style={input} type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="temporary password" />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={label}>Name (optional)</label>
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          {error && <div style={{ color: COLORS.down, fontFamily: SANS, fontSize: 12, marginBottom: 12 }}>{error}</div>}
          {ok && <div style={{ color: COLORS.up, fontFamily: SANS, fontSize: 12, marginBottom: 12 }}>{ok}</div>}
          <button type="submit" disabled={saving} style={{ all: "unset", cursor: saving ? "wait" : "pointer", width: "100%", textAlign: "center", boxSizing: "border-box", padding: "11px 0", border: `1px solid ${COLORS.amber}`, color: COLORS.amber, fontFamily: MONO, fontSize: 11, letterSpacing: 1.2 }}>
            {saving ? "CREATING…" : "CREATE ACCOUNT"}
          </button>
        </form>
      </div>
    </div>
  );
}

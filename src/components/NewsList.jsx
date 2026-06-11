import React from "react";
import { ExternalLink } from "lucide-react";
import { COLORS, MONO, SANS } from "../lib/theme";

function timeAgo(dt) {
  const d = new Date(dt).getTime();
  const diff = Date.now() - d;
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 6e4))}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NewsList({ news, emptyLabel = "No news yet — refresh market data." }) {
  if (!news?.length) {
    return <div style={{ padding: 16, color: COLORS.textDim, fontSize: 13, fontFamily: SANS }}>{emptyLabel}</div>;
  }
  return (
    <div style={{ overflowY: "auto" }}>
      {news.map((n) => (
        <a
          key={n.id}
          href={n.url || "#"}
          target="_blank"
          rel="noreferrer"
          style={{ display: "block", textDecoration: "none", padding: "12px 16px", borderBottom: `1px solid ${COLORS.border}` }}
          onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.panelHi)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                {n.symbol && (
                  <span style={{ fontFamily: MONO, fontSize: 9, color: COLORS.amber, border: `1px solid ${COLORS.amberDim}`, padding: "1px 5px", letterSpacing: 1 }}>
                    {n.symbol}
                  </span>
                )}
                <span style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1 }}>
                  {n.source ?? "—"} · {timeAgo(n.datetime)}
                </span>
              </div>
              <div style={{ fontFamily: SANS, fontSize: 13, color: COLORS.text, lineHeight: 1.4 }}>{n.headline}</div>
            </div>
            <ExternalLink size={13} color={COLORS.textMute} style={{ flexShrink: 0, marginTop: 2 }} />
          </div>
        </a>
      ))}
    </div>
  );
}

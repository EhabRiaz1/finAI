import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { COLORS, MONO, SANS, SERIF } from "../lib/theme";

/* ------------------------------------------------------------------
   Markdown renderer for assistant output — GFM (tables!) styled to
   match the terminal's dark theme. This is what makes LLM formatting
   "on point" instead of raw text in a pre-wrap div.
   ------------------------------------------------------------------ */

const components = {
  p: ({ children }) => (
    <p style={{ margin: "0 0 10px", lineHeight: 1.65 }}>{children}</p>
  ),
  h1: ({ children }) => (
    <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 22, color: COLORS.text, margin: "18px 0 8px" }}>{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 19, color: COLORS.text, margin: "16px 0 8px" }}>{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ fontFamily: MONO, fontWeight: 600, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: COLORS.amber, margin: "14px 0 6px" }}>{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 style={{ fontFamily: MONO, fontWeight: 600, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: COLORS.textDim, margin: "12px 0 6px" }}>{children}</h4>
  ),
  ul: ({ children }) => <ul style={{ margin: "0 0 10px", paddingLeft: 20, lineHeight: 1.65 }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: "0 0 10px", paddingLeft: 20, lineHeight: 1.65 }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: 3 }}>{children}</li>,
  strong: ({ children }) => <strong style={{ color: "#ffffff", fontWeight: 600 }}>{children}</strong>,
  em: ({ children }) => <em style={{ color: COLORS.textDim }}>{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: COLORS.cyan, textDecoration: "none", borderBottom: `1px solid ${COLORS.cyan}44` }}>
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{ margin: "0 0 10px", padding: "4px 14px", borderLeft: `2px solid ${COLORS.amberDim}`, color: COLORS.textDim }}>
      {children}
    </blockquote>
  ),
  hr: () => <hr style={{ border: "none", borderTop: `1px solid ${COLORS.border}`, margin: "14px 0" }} />,
  code: ({ inline, children, ...props }) =>
    inline ? (
      <code style={{ fontFamily: MONO, fontSize: "0.88em", background: COLORS.panelHi, border: `1px solid ${COLORS.border}`, borderRadius: 3, padding: "1px 5px", color: COLORS.amber }}>
        {children}
      </code>
    ) : (
      <code style={{ fontFamily: MONO, fontSize: 12, display: "block", lineHeight: 1.6 }} {...props}>
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, padding: "12px 14px", overflowX: "auto", margin: "0 0 12px" }}>
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div style={{ overflowX: "auto", margin: "4px 0 14px" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  th: ({ children, style }) => (
    <th
      style={{
        fontFamily: MONO,
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: COLORS.amber,
        textAlign: style?.textAlign ?? "left",
        padding: "7px 12px",
        borderBottom: `1px solid ${COLORS.borderHi}`,
        background: COLORS.panel,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td
      style={{
        fontFamily: MONO,
        fontSize: 12,
        color: COLORS.text,
        textAlign: style?.textAlign ?? "left",
        padding: "7px 12px",
        borderBottom: `1px solid ${COLORS.border}`,
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  ),
};

export default function MarkdownMessage({ text }) {
  return (
    <div style={{ fontFamily: SANS, fontSize: 13.5, color: COLORS.text, wordBreak: "break-word" }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

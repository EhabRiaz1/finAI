import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { COLORS, FONTS, MONO, SANS, SERIF } from "../lib/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    background: COLORS.bg,
    border: `1px solid ${COLORS.borderHi}`,
    color: COLORS.text,
    fontFamily: MONO,
    fontSize: 13,
    boxSizing: "border-box",
    outline: "none",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: SANS,
      }}
    >
      <style>{FONTS}</style>
      <div style={{ width: 380, maxWidth: "92vw" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: SERIF, fontSize: 40, fontStyle: "italic", color: COLORS.text }}>
            Finance<span style={{ color: COLORS.amber, fontStyle: "normal" }}> AI</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: COLORS.textMute, letterSpacing: 2, marginTop: 6 }}>
            INSTITUTIONAL ASSET MANAGEMENT TERMINAL
          </div>
        </div>

        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, padding: 28 }}>
          <div style={{ fontFamily: SERIF, fontSize: 22, color: COLORS.text, marginBottom: 4 }}>
            Sign in
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: COLORS.textDim, marginBottom: 22 }}>
            Authenticate to access your portfolio.
          </div>

          <form onSubmit={handleSubmit}>
            <label style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textDim, letterSpacing: 1.2 }}>EMAIL</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ ...inputStyle, marginTop: 6, marginBottom: 16 }}
              onFocus={(e) => (e.currentTarget.style.borderColor = COLORS.amberDim)}
              onBlur={(e) => (e.currentTarget.style.borderColor = COLORS.borderHi)}
            />
            <label style={{ fontFamily: MONO, fontSize: 9, color: COLORS.textDim, letterSpacing: 1.2 }}>PASSWORD</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ ...inputStyle, marginTop: 6, marginBottom: 18 }}
              onFocus={(e) => (e.currentTarget.style.borderColor = COLORS.amberDim)}
              onBlur={(e) => (e.currentTarget.style.borderColor = COLORS.borderHi)}
            />
            {error && (
              <div style={{ color: COLORS.down, fontSize: 12, marginBottom: 14 }}>{error}</div>
            )}
            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{
                all: "unset",
                cursor: loading ? "wait" : "pointer",
                width: "100%",
                textAlign: "center",
                boxSizing: "border-box",
                padding: "12px 0",
                background: !loading && email && password ? COLORS.amber : "transparent",
                color: !loading && email && password ? COLORS.bg : COLORS.textMute,
                border: `1px solid ${!loading && email && password ? COLORS.amber : COLORS.border}`,
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: 1.5,
              }}
            >
              {loading ? "AUTHENTICATING…" : "SIGN IN"}
            </button>
          </form>
        </div>
        <div style={{ textAlign: "center", marginTop: 16, fontFamily: MONO, fontSize: 9, color: COLORS.textMute, letterSpacing: 1 }}>
          SECURED BY SUPABASE AUTH · RLS ENABLED
        </div>
      </div>
    </div>
  );
}

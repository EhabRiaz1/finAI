import React, { useEffect, useState } from "react";
import { COLORS, FONTS, MONO, SERIF } from "../lib/theme";

/* ------------------------------------------------------------------
   WelcomeIntro — full-screen "Welcome, {name}" overlay played once
   at login. Self-dismisses after ~3.3s via onDone(). Pure black,
   blur-in serif reveal, amber shimmer, drawing underline.
   ------------------------------------------------------------------ */
export default function WelcomeIntro({ name, onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 2600); // begin fade-out
    const t2 = setTimeout(() => onDone?.(), 3300); // unmount after fade
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  const display = (name && String(name).trim()) || "back";

  return (
    <div className={`wi-root${leaving ? " wi-leaving" : ""}`}>
      <style>{`
        ${FONTS}
        @keyframes wi-rise { from { opacity:0; transform:translateY(14px); filter:blur(6px);} to { opacity:1; transform:none; filter:blur(0);} }
        @keyframes wi-name { 0% { opacity:0; transform:translateY(26px) scale(.985); filter:blur(16px);} 100% { opacity:1; transform:none; filter:blur(0);} }
        @keyframes wi-line { from { transform:scaleX(0);} to { transform:scaleX(1);} }
        @keyframes wi-shimmer { 0% { background-position:180% 0;} 100% { background-position:-80% 0;} }
        @keyframes wi-glow { 0%,100% { opacity:.45; transform:scale(.96);} 50% { opacity:.85; transform:scale(1.04);} }
        .wi-root { position:fixed; inset:0; z-index:9999; background:#000; display:flex; align-items:center; justify-content:center; overflow:hidden;
          transition: opacity .7s ease, transform .7s ease, filter .7s ease; }
        .wi-leaving { opacity:0; transform:scale(1.03); filter:blur(8px); pointer-events:none; }
        .wi-glow { position:absolute; width:min(900px,150vw); height:min(900px,150vw); border-radius:50%;
          background: radial-gradient(circle, rgba(245,165,36,.10) 0%, rgba(245,165,36,.03) 35%, transparent 70%);
          animation: wi-glow 4.5s ease-in-out infinite; }
        .wi-inner { position:relative; text-align:center; padding:0 24px; }
        .wi-kicker { font-family:${MONO}; font-size:11px; letter-spacing:8px; text-transform:uppercase; color:${COLORS.textDim};
          opacity:0; animation: wi-rise .9s cubic-bezier(.2,.7,.2,1) .15s forwards; }
        .wi-name { margin-top:16px; font-family:${SERIF}; font-style:italic; font-weight:400; line-height:1.02;
          font-size: clamp(44px, 9vw, 104px);
          background: linear-gradient(100deg, #e5e5e5 0%, #ffffff 30%, ${COLORS.amber} 50%, #ffffff 70%, #e5e5e5 100%);
          background-size: 220% auto; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent;
          opacity:0; animation: wi-name 1.2s cubic-bezier(.16,1,.3,1) .45s forwards, wi-shimmer 3.4s linear .7s infinite; }
        .wi-line { height:1px; width:min(340px,70vw); margin:26px auto 0; transform:scaleX(0); transform-origin:center;
          background:linear-gradient(90deg, transparent, ${COLORS.amber}, transparent);
          animation: wi-line 1.1s cubic-bezier(.16,1,.3,1) 1s forwards; }
        .wi-brand { margin-top:28px; font-family:${SERIF}; font-style:italic; font-size:19px; color:${COLORS.text};
          opacity:0; animation: wi-rise .9s ease 1.35s forwards; }
        .wi-brand span { color:${COLORS.amber}; font-style:normal; }
        @media (prefers-reduced-motion: reduce) {
          .wi-kicker, .wi-name, .wi-line, .wi-brand { animation-duration:.01s !important; animation-delay:0s !important; opacity:1 !important; transform:none !important; filter:none !important; }
        }
      `}</style>
      <div className="wi-glow" />
      <div className="wi-inner">
        <div className="wi-kicker">Welcome,</div>
        <div className="wi-name">{display}</div>
        <div className="wi-line" />
        <div className="wi-brand">Finance<span>&nbsp;AI</span></div>
      </div>
    </div>
  );
}

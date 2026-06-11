import React from "react";
import { SANS } from "../lib/theme";

/* ------------------------------------------------------------------
   Claude.ai-style fading shimmer shown while the model is thinking
   or running tools. The `fa-shimmer` keyframe is defined in the app's
   global <style> block: a gradient swept across text via
   background-clip: text.
   ------------------------------------------------------------------ */

export default function ThinkingIndicator({ label }) {
  return (
    <div
      style={{
        fontFamily: SANS,
        fontSize: 13,
        fontStyle: "italic",
        padding: "2px 0 6px",
        backgroundImage: "linear-gradient(90deg, #525252 0%, #525252 35%, #e5e5e5 50%, #525252 65%, #525252 100%)",
        backgroundSize: "200% 100%",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        animation: "fa-shimmer 2s linear infinite",
      }}
    >
      {label || "Thinking…"}
    </div>
  );
}

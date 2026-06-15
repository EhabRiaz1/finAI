import React, { useEffect, useRef } from "react";
import { COLORS } from "../lib/theme";

/* ------------------------------------------------------------------
   Thin wrappers around TradingView's free embeddable widgets, themed
   to the dark/amber terminal. Each widget injects its own <script>.
   ------------------------------------------------------------------ */

function TVWidget({ src, config, height = 400 }) {
  const ref = useRef(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    container.innerHTML = "";
    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify(config);
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, JSON.stringify(config)]);

  return (
    <div
      ref={ref}
      className="tradingview-widget-container"
      style={{ height, width: "100%", background: COLORS.bg, overflow: "hidden" }}
    />
  );
}

export function TVAdvancedChart({ symbol, height = 460 }) {
  return (
    <TVWidget
      height={height}
      src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
      config={{
        width: "100%",
        height,
        symbol,
        interval: "D",
        timezone: "America/New_York",
        theme: "dark",
        style: "1",
        locale: "en",
        backgroundColor: COLORS.bg,
        gridColor: "rgba(255,255,255,0.04)",
        hide_top_toolbar: false,
        hide_legend: false,
        allow_symbol_change: true,
        save_image: false,
        calendar: false,
        support_host: "https://www.tradingview.com",
      }}
    />
  );
}

export function TVSymbolInfo({ symbol, height = 130 }) {
  return (
    <TVWidget
      height={height}
      src="https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js"
      config={{ symbol, width: "100%", locale: "en", colorTheme: "dark", isTransparent: false }}
    />
  );
}

export function TVCompanyProfile({ symbol, height = 440 }) {
  return (
    <TVWidget
      height={height}
      src="https://s3.tradingview.com/external-embedding/embed-widget-symbol-profile.js"
      config={{ symbol, width: "100%", height: "100%", locale: "en", colorTheme: "dark", isTransparent: false }}
    />
  );
}

export function TVFundamentalData({ symbol }) {
  return (
    <TVWidget
      height={490}
      src="https://s3.tradingview.com/external-embedding/embed-widget-financials.js"
      config={{
        symbol,
        colorTheme: "dark",
        isTransparent: true,
        largeChartUrl: "",
        displayMode: "regular",
        width: "100%",
        height: "100%",
        locale: "en",
      }}
    />
  );
}

export function TVTechnicalAnalysis({ symbol }) {
  return (
    <TVWidget
      height={400}
      src="https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js"
      config={{
        interval: "1D",
        width: "100%",
        height: "100%",
        symbol,
        showIntervalTabs: true,
        displayMode: "single",
        locale: "en",
        colorTheme: "dark",
        isTransparent: true,
      }}
    />
  );
}

export function TVTimeline({ symbol, height = 440 }) {
  return (
    <TVWidget
      height={height}
      src="https://s3.tradingview.com/external-embedding/embed-widget-timeline.js"
      config={{
        feedMode: symbol ? "symbol" : "market",
        symbol,
        market: symbol ? undefined : "stock",
        isTransparent: false,
        displayMode: "regular",
        width: "100%",
        height: "100%",
        colorTheme: "dark",
        locale: "en",
      }}
    />
  );
}

export function TVMiniSymbol({ symbol, height = 220 }) {
  return (
    <TVWidget
      height={height}
      src="https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js"
      config={{
        symbol,
        width: "100%",
        height: "100%",
        locale: "en",
        dateRange: "12M",
        colorTheme: "dark",
        isTransparent: true,
        autosize: true,
        chartOnly: false,
      }}
    />
  );
}

export function TVScreener({ height = 560 }) {
  return (
    <TVWidget
      height={height}
      src="https://s3.tradingview.com/external-embedding/embed-widget-screener.js"
      config={{
        width: "100%",
        height: "100%",
        defaultColumn: "overview",
        defaultScreen: "general",
        market: "america",
        showToolbar: true,
        colorTheme: "dark",
        locale: "en",
        isTransparent: false,
      }}
    />
  );
}

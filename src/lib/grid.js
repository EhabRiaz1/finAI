/* ------------------------------------------------------------------
   Pure spreadsheet grid helpers (no heavy deps) — A1 addressing, cell
   edits, overview. Safe to import anywhere (kept out of the xlsx chunk).
   Grid model: { sheets: [{ name, rows: (string|number|null)[][] }], activeSheet }
   ------------------------------------------------------------------ */

export const MAX_RENDER_ROWS = 1000;

export function colLetter(idx) {
  let n = idx;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function letterCol(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseA1(ref) {
  const m = String(ref ?? "").trim().match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return null;
  return { row: parseInt(m[2], 10) - 1, col: letterCol(m[1]) };
}

export function formatA1(row, col) {
  return `${colLetter(col)}${row + 1}`;
}

export function sheetWidth(sheet) {
  return (sheet?.rows ?? []).reduce((w, r) => Math.max(w, r.length), 0);
}

export function normalizeWidth(rows) {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows.map((r) => {
    const out = r.slice(0, w);
    while (out.length < w) out.push(null);
    return out.map((c) => (c === undefined || c === "" ? null : c));
  });
}

/** numeric strings -> numbers; "" -> null; else string. */
export function coerceValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const s = String(v);
  if (s.trim() === "") return null;
  if (/^-?\d+(\.\d+)?$/.test(s.trim())) {
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return s;
}

/** Return a new data object with cell edits applied to a sheet. */
export function applyEdits(data, sheetIdx, edits) {
  const next = structuredClone(data);
  const sheet = next.sheets[sheetIdx];
  if (!sheet) return next;
  for (const e of edits) {
    const { row, col } = e;
    if (row == null || col == null || row < 0 || col < 0) continue;
    while (sheet.rows.length <= row) sheet.rows.push([]);
    const r = sheet.rows[row];
    while (r.length <= col) r.push(null);
    r[col] = coerceValue(e.value);
  }
  sheet.rows = normalizeWidth(sheet.rows);
  return next;
}

/** Compact per-sheet overview the agent receives. */
export function artifactOverview(data) {
  return (data?.sheets ?? []).map((s, i) => ({
    index: i,
    name: s.name,
    rows: s.rows.length,
    cols: sheetWidth(s),
    header: (s.rows[0] ?? []).map((c) => (c == null ? "" : String(c))),
  }));
}

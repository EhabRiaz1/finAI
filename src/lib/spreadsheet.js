import * as XLSX from "xlsx";
import { normalizeWidth } from "./grid";

/* ------------------------------------------------------------------
   xlsx-backed parse/export. Heavy (SheetJS) — import this module only
   from code paths that actually touch files (lazy/dynamic), so it stays
   out of the initial bundle. Pure grid ops live in ./grid.js.
   ------------------------------------------------------------------ */

/** Parse a File's ArrayBuffer into the artifact grid model. */
export function parseWorkbook(arrayBuffer, name) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheets = wb.SheetNames.map((sheetName) => {
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false });
    return { name: sheetName, rows: normalizeWidth(aoa.length ? aoa : [[null]]) };
  });
  return { name, sheets: sheets.length ? sheets : [{ name: "Sheet1", rows: [[null]] }], activeSheet: 0 };
}

/** Build an XLSX workbook from the grid model and trigger a download. */
export function exportXlsx(data, filename) {
  const wb = XLSX.utils.book_new();
  data.sheets.forEach((s, i) => {
    const aoa = s.rows.map((r) => r.map((c) => (c == null ? "" : c)));
    const ws = XLSX.utils.aoa_to_sheet(aoa.length ? aoa : [[""]]);
    XLSX.utils.book_append_sheet(wb, ws, (s.name || `Sheet${i + 1}`).slice(0, 31));
  });
  const base = (filename || data.name || "artifact").replace(/\.(xlsx|xls|csv)$/i, "");
  XLSX.writeFile(wb, `${base}.xlsx`);
}

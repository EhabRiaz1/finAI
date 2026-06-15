import mammoth from "mammoth/mammoth.browser";
import { supabase } from "./supabase";
import { artifactOverview } from "./grid";
import { parseWorkbook } from "./spreadsheet";

/* ------------------------------------------------------------------
   File ingest — turn a dropped/selected File into a typed attachment
   descriptor the composer can hold and the chat can send. Spreadsheets
   become editable artifacts (persisted to ai_artifacts); PDFs/images go
   to Anthropic as native blocks; docx/text become text context.
   ------------------------------------------------------------------ */

// Inline cap for base64-encoded files sent through the edge function body.
const INLINE_CAP = 4.5 * 1024 * 1024;
const TEXT_CAP = 200_000; // chars of plain text included as context

const IMAGE_TYPES = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
};

function ext(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function bytesToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Ingest a File -> descriptor. Throws Error (with a user-facing message) on
 * unsupported type or oversize. Spreadsheets are persisted immediately.
 */
export async function ingestFile(file) {
  const e = ext(file.name);
  const buf = await file.arrayBuffer();

  // --- Spreadsheets -> editable artifact ---
  if (e === "xlsx" || e === "xls" || e === "csv") {
    const data = parseWorkbook(buf, file.name);
    const { data: row, error } = await supabase
      .from("ai_artifacts")
      .insert({ name: file.name, kind: "spreadsheet", data })
      .select("id")
      .single();
    if (error) throw new Error(`Could not save spreadsheet: ${error.message}`);
    return {
      kind: "artifact",
      name: file.name,
      artifactId: row.id,
      data,
      overview: artifactOverview(data),
      size: file.size,
    };
  }

  // --- PDF -> native document block ---
  if (e === "pdf") {
    if (file.size > INLINE_CAP) throw new Error(`PDF too large (max ${(INLINE_CAP / 1048576).toFixed(1)}MB).`);
    return { kind: "document", name: file.name, mediaType: "application/pdf", data: bytesToBase64(buf), size: file.size };
  }

  // --- Images -> native image block ---
  if (IMAGE_TYPES[e]) {
    if (file.size > INLINE_CAP) throw new Error(`Image too large (max ${(INLINE_CAP / 1048576).toFixed(1)}MB).`);
    return { kind: "image", name: file.name, mediaType: IMAGE_TYPES[e], data: bytesToBase64(buf), size: file.size };
  }

  // --- Word -> extracted text ---
  if (e === "docx") {
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    return { kind: "text", name: file.name, text: clampText(value), size: file.size };
  }

  // --- Plain text-ish ---
  if (["txt", "md", "json", "tsv"].includes(e)) {
    const text = new TextDecoder().decode(buf);
    return { kind: "text", name: file.name, text: clampText(text), size: file.size };
  }

  throw new Error(`Unsupported file type: .${e}`);
}

function clampText(t) {
  const s = String(t ?? "");
  return s.length > TEXT_CAP ? `${s.slice(0, TEXT_CAP)}\n\n…[truncated]` : s;
}

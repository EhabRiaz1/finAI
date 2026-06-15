/* Pure attachment helpers (no heavy deps). The actual parsing lives in
   ./fileIngest.js (dynamic-imported), which pulls in xlsx/mammoth. */

export const ACCEPT = ".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.txt,.md,.json,.tsv";

export function attachmentIcon(kind) {
  return { artifact: "sheet", document: "pdf", image: "image", text: "text" }[kind] ?? "file";
}

/** Convert an ingest descriptor into Anthropic message content block(s). */
export function attachmentToBlocks(att) {
  switch (att.kind) {
    case "document":
      return [{ type: "document", title: att.name, source: { type: "base64", media_type: att.mediaType, data: att.data } }];
    case "image":
      return [{ type: "image", source: { type: "base64", media_type: att.mediaType, data: att.data } }];
    case "text":
      return [{ type: "text", text: `Attached file "${att.name}":\n\n${att.text}` }];
    case "artifact": {
      const sheets = (att.overview ?? [])
        .map((s) => `sheet "${s.name}" (${s.rows}×${s.cols}${s.header?.length ? `, header: ${s.header.filter(Boolean).slice(0, 12).join(", ")}` : ""})`)
        .join("; ");
      return [{
        type: "text",
        text: `[Active spreadsheet artifact — id=${att.artifactId}, name="${att.name}": ${sheets}. Use read_artifact to inspect cells/ranges and set_cells/set_range (with this artifact_id) to propose edits; edits appear as staged previews the user applies.]`,
      }];
    }
    default:
      return [];
  }
}

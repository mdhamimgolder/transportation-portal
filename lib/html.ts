const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapes a value for interpolation into an HTML email body. Every
 * user-controlled string (names, addresses, reasons, comments) must pass
 * through this before landing in markup.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/** Plain text → safe HTML (escaped, newlines preserved). */
export function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

/**
 * Safely converts standard Markdown to Telegram-compliant HTML.
 * Escapes HTML characters first to avoid entity parsing crashes.
 */
export function markdownToHtml(md: string): string {
  if (!md) return '';

  // 1. Escape HTML special characters to prevent Telegram API entity parsing errors
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. Convert block code: ```lang code``` or ```code``` -> <pre>code</pre>
  html = html.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, '<pre>$1</pre>');

  // 3. Convert inline code: `code` -> <code>code</code>
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // 4. Convert bold: **text** -> <b>text</b>
  html = html.replace(/\*\*([\s\S]*?)\*\*/g, '<b>$1</b>');

  // 5. Convert bullet points: starting lines with * or - -> •
  // Matches optional whitespace followed by * or - and then a space
  html = html.replace(/^\s*[-*]\s+/gm, '• ');

  // 6. Convert italic: *text* or _text_ -> <i>text</i>
  html = html.replace(/\*([\s\S]*?)\*/g, '<i>$1</i>');
  html = html.replace(/_([\s\S]*?)_/g, '<i>$1</i>');

  return html;
}

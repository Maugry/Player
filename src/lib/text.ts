/**
 * Split a plain-text string (e.g. a Payload `textarea` detail text-block) into
 * paragraphs on blank lines. Single newlines stay within a paragraph. Empty
 * paragraphs are dropped.
 */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
}

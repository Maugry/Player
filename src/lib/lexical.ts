/**
 * Helpers for Payload's Lexical rich-text wire format.
 *
 * The CMS stores some short fields (menu-item titles, descriptions, showcase
 * captions) as Lexical rich-text objects (`{ root: { children: [...] } }`),
 * while the Player renders them as plain strings. `lexicalToPlainText`
 * flattens a Lexical value to its text content, and passes plain strings
 * through unchanged so callers can use it defensively on either shape.
 */

interface LexicalNodeLike {
  type?: string
  text?: string
  children?: LexicalNodeLike[]
}

interface LexicalRichText {
  root?: { children?: LexicalNodeLike[] }
}

function collectNodeText(nodes: LexicalNodeLike[], parts: string[]): void {
  for (const node of nodes) {
    if (typeof node.text === 'string') parts.push(node.text)
    if (Array.isArray(node.children)) collectNodeText(node.children, parts)
  }
}

/**
 * Flatten a Lexical rich-text value to plain text.
 * - Plain strings are returned unchanged.
 * - null/undefined and non-Lexical objects return ''.
 * - Top-level blocks (paragraphs, headings, list items) are joined with a space.
 */
export function lexicalToPlainText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value !== 'object') return String(value)

  const root = (value as LexicalRichText).root
  if (!root || !Array.isArray(root.children)) return ''

  const blocks: string[] = []
  for (const block of root.children) {
    const parts: string[] = []
    if (typeof block.text === 'string') parts.push(block.text)
    if (Array.isArray(block.children)) collectNodeText(block.children, parts)
    const text = parts.join('')
    if (text) blocks.push(text)
  }
  return blocks.join(' ').trim()
}

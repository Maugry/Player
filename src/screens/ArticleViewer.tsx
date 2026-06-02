/**
 * Article Viewer Screen
 * Displays rich text content from CMS
 */

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Home } from 'lucide-react'
import type { MenuItem } from '@/types'

interface ArticleViewerProps {
  item: MenuItem
  onBack: () => void
  onHome: () => void
}

// Minimal structural typing for Payload's Lexical rich-text wire format.
// The CMS payload is otherwise untyped; we only read the fields rendered below.
interface LexicalTextNode {
  type?: string
  text?: string
  format?: number
}
interface LexicalNode {
  type?: string
  tag?: number | string
  listType?: string
  text?: string
  children?: LexicalNode[]
}
interface LexicalContent {
  root?: { children?: LexicalNode[] }
}

export function ArticleViewer({ item, onBack, onHome }: ArticleViewerProps) {
  // For now, just display basic text content
  // In production, this would render Payload's Lexical rich text
  const renderContent = (content: unknown) => {
    if (!content) return null

    // Handle Lexical rich text format
    if (typeof content === 'object' && (content as LexicalContent).root?.children) {
      return (content as LexicalContent).root!.children!.map((node: LexicalNode, index: number) => {
        if (node.type === 'paragraph') {
          return (
            <p key={index} className="mb-4 text-lg leading-relaxed">
              {node.children?.map((child: LexicalTextNode, i: number) => {
                if (child.type === 'text') {
                  let text: ReactNode = child.text
                  const format = child.format ?? 0
                  if (format & 1) text = <strong key={i}>{text}</strong>
                  if (format & 2) text = <em key={i}>{text}</em>
                  return text
                }
                return child.text || ''
              })}
            </p>
          )
        }

        if (node.type === 'heading') {
          const Tag = `h${node.tag || 2}` as keyof JSX.IntrinsicElements
          return (
            <Tag key={index} className="text-2xl font-bold mb-4 mt-6">
              {node.children?.map((c: LexicalNode) => c.text).join('')}
            </Tag>
          )
        }

        if (node.type === 'list') {
          const ListTag = node.listType === 'number' ? 'ol' : 'ul'
          return (
            <ListTag key={index} className="list-inside mb-4 ml-4">
              {node.children?.map((li: LexicalNode, i: number) => (
                <li key={i} className="mb-2">
                  {li.children?.map((c: LexicalNode) => c.text).join('')}
                </li>
              ))}
            </ListTag>
          )
        }

        return null
      })
    }

    // Fallback for plain text or unknown format
    if (typeof content === 'string') {
      return <p className="text-lg leading-relaxed whitespace-pre-wrap">{content}</p>
    }

    return <p className="text-muted-foreground">Контент недоступен</p>
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 bg-background/95 backdrop-blur border-b z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="lg" onClick={onBack}>
              <ArrowLeft className="w-6 h-6 mr-2" />
              Назад
            </Button>
            <Button variant="outline" size="lg" onClick={onHome}>
              <Home className="w-6 h-6 mr-2" />
              Главная
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Cover image */}
        {item.thumbnail?.url && (
          <div className="aspect-video mb-8 rounded-lg overflow-hidden">
            <img
              src={item.thumbnail.url}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Title */}
        <h1 className="text-4xl font-bold mb-6">{item.title}</h1>

        {/* Description */}
        {item.description && (
          <p className="text-xl text-muted-foreground mb-8">{item.description}</p>
        )}

        {/* Article content */}
        <div className="prose prose-lg dark:prose-invert max-w-none">
          {item.article ? renderContent(item.article.content) : (
            <p className="text-muted-foreground">Загрузка контента...</p>
          )}
        </div>
      </main>
    </div>
  )
}

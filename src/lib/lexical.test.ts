import { describe, it, expect } from 'vitest'
import { lexicalToPlainText } from './lexical'

describe('lexicalToPlainText', () => {
  it('returns a plain string unchanged', () => {
    expect(lexicalToPlainText('Hello')).toBe('Hello')
  })

  it('returns empty string for null/undefined', () => {
    expect(lexicalToPlainText(null)).toBe('')
    expect(lexicalToPlainText(undefined)).toBe('')
  })

  it('flattens a single-paragraph Lexical title to its text', () => {
    const value = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'Тестовый заголовок' }],
          },
        ],
      },
    }
    expect(lexicalToPlainText(value)).toBe('Тестовый заголовок')
  })

  it('joins multiple text nodes within a paragraph without extra spaces', () => {
    const value = {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'Hello ' },
              { type: 'text', text: 'world' },
            ],
          },
        ],
      },
    }
    expect(lexicalToPlainText(value)).toBe('Hello world')
  })

  it('joins multiple blocks with a single space', () => {
    const value = {
      root: {
        children: [
          { type: 'heading', children: [{ type: 'text', text: 'Title' }] },
          { type: 'paragraph', children: [{ type: 'text', text: 'Body' }] },
        ],
      },
    }
    expect(lexicalToPlainText(value)).toBe('Title Body')
  })

  it('returns empty string for an object without a Lexical root', () => {
    expect(lexicalToPlainText({ foo: 'bar' })).toBe('')
  })
})

import { describe, it, expect } from 'vitest'
import { splitParagraphs } from './text'

describe('splitParagraphs', () => {
  it('splits on blank lines and trims each paragraph', () => {
    expect(splitParagraphs('one\n\ntwo')).toEqual(['one', 'two'])
  })
  it('treats a single newline as part of the same paragraph', () => {
    expect(splitParagraphs('line a\nline b')).toEqual(['line a\nline b'])
  })
  it('drops empty paragraphs and returns [] for blank input', () => {
    expect(splitParagraphs('\n\n  \n\n')).toEqual([])
    expect(splitParagraphs('')).toEqual([])
  })
})

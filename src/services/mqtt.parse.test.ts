import { describe, it, expect } from 'vitest'
import { parseCommand } from '@/services/mqtt'

const cmd = (leaf: string, raw: string) => parseCommand(leaf, raw)

describe('parseCommand', () => {
  it('volume: bare integer', () => {
    expect(cmd('volume', '75')).toEqual({ action: 'volume', value: 75 })
  })
  it('volume: non-numeric ignored', () => {
    expect(cmd('volume', 'loud')).toBeNull()
  })
  it('locale: bare JSON string', () => {
    expect(cmd('locale', '"en"')).toEqual({ action: 'locale', value: 'en' })
  })
  it('locale: unquoted string tolerated', () => {
    expect(cmd('locale', 'ru')).toEqual({ action: 'locale', value: 'ru' })
  })
  it('loop: bare boolean', () => {
    expect(cmd('loop', 'true')).toEqual({ action: 'loop', value: true })
    expect(cmd('loop', 'false')).toEqual({ action: 'loop', value: false })
  })
  it('power: bare strings map to actions', () => {
    expect(cmd('power', 'off')).toEqual({ action: 'power_off' })
    expect(cmd('power', 'shutdown')).toEqual({ action: 'power_off' })
    expect(cmd('power', 'reboot')).toEqual({ action: 'reboot' })
    expect(cmd('power', 'nonsense')).toBeNull()
  })
  it('playback: play with mediaId', () => {
    expect(cmd('playback', JSON.stringify({ action: 'play', mediaId: 'm1' })))
      .toEqual({ action: 'play', value: 'm1' })
  })
  it('playback: content with contentId', () => {
    expect(cmd('playback', JSON.stringify({ action: 'content', contentId: 'c1' })))
      .toEqual({ action: 'content', value: 'c1' })
  })
  it('playback: seek carries value', () => {
    expect(cmd('playback', JSON.stringify({ action: 'seek', value: 30 })))
      .toEqual({ action: 'seek', value: 30 })
  })
  it('playback: trigger_play carries envelope', () => {
    const raw = JSON.stringify({
      action: 'trigger_play', mediaId: 'm1', mediaUrl: 'u', mediaMimeType: 'video/mp4', mediaTitle: 't',
    })
    expect(cmd('playback', raw)).toEqual({
      action: 'trigger_play',
      trigger: { mediaId: 'm1', mediaUrl: 'u', mediaMimeType: 'video/mp4', mediaTitle: 't' },
    })
  })
  it('playback: screensaver / bare actions', () => {
    expect(cmd('playback', JSON.stringify({ action: 'screensaver' }))).toEqual({ action: 'screensaver' })
    expect(cmd('playback', JSON.stringify({ action: 'pause' }))).toEqual({ action: 'pause' })
  })
  it('app: JSON actions accepted', () => {
    expect(cmd('app', JSON.stringify({ action: 'sync' }))).toEqual({ action: 'sync' })
    expect(cmd('app', JSON.stringify({ action: 'mode', value: 'loop' }))).toEqual({ action: 'mode', value: 'loop' })
    expect(cmd('app', JSON.stringify({ action: 'quit' }))).toEqual({ action: 'quit' })
    // `restart` on commands/app is a Supervisor command (bare string), NOT a
    // Player JSON command. Per the Standard, the Player's app union is only
    // sync/mode/quit, so JSON {action:'restart'} is not a valid Player command.
    expect(cmd('app', JSON.stringify({ action: 'restart' }))).toBeNull()
  })
  it('app: bare-string Supervisor payloads ignored', () => {
    expect(cmd('app', 'start')).toBeNull()
    expect(cmd('app', 'stop')).toBeNull()
    expect(cmd('app', 'restart')).toBeNull()
  })
  it('playback: malformed JSON ignored', () => {
    expect(cmd('playback', '{not valid json')).toBeNull()
  })
  it('playback: trigger_play missing mediaUrl ignored', () => {
    expect(cmd('playback', JSON.stringify({ action: 'trigger_play', mediaId: 'm1', mediaMimeType: 'video/mp4' }))).toBeNull()
  })
  it('unknown leaf ignored', () => {
    expect(cmd('bogus', 'x')).toBeNull()
  })
})

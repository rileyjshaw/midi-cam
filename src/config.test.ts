import { describe, expect, it } from 'vitest'
import { COLOR_NAMES, COLOR_PALETTE, createConnection } from './config'

describe('connection color palette', () => {
  it('keeps the requested utility and primary colors in the first two rows', () => {
    expect(COLOR_PALETTE.slice(0, 6)).toEqual([
      'transparent', '#FFFFFF', '#8C919B', '#0A0A0C', '#D4AF37', 'rainbow',
    ])
    expect(COLOR_PALETTE.slice(6, 12).map((color) => COLOR_NAMES[color])).toEqual([
      'Red', 'Yellow', 'Blue', 'Purple', 'Orange', 'Green',
    ])
    expect(COLOR_NAMES['#22D3EE']).toBe('Cyan')
    expect(COLOR_NAMES['#D946EF']).toBe('Magenta')
  })

  it('defaults new controls to a visible color', () => {
    expect(createConnection([]).color).toBe('#FFFFFF')
  })
})

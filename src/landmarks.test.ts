import { describe, expect, it } from 'vitest'
import { LANDMARK_GROUPS } from './landmarks'

describe('curated landmark groups', () => {
  it('keeps facial points out of the body group', () => {
    const body = LANDMARK_GROUPS.find((group) => group.label === 'BODY')
    expect(body?.options.every((option) => (option.index ?? 0) >= 11)).toBe(true)
    expect(body?.options[0]?.id).toBe('pose:11')
  })

  it('offers only a base and tip for each finger', () => {
    const hand = LANDMARK_GROUPS.find((group) => group.label === 'HAND')
    const leftHandIndices = hand?.options
      .filter((option) => option.side === 'left')
      .map((option) => option.index)

    expect(leftHandIndices).toEqual([0, 2, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21])
    expect(hand?.options.some((option) => /\b(PIP|DIP|IP|CMC)\b/.test(option.label))).toBe(false)
  })
})

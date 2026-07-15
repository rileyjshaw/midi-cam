import { describe, expect, it } from 'vitest'
import {
  mapMeasurementToMidi,
  measurePoints,
  unwrapAngle,
  wrapUndirectedAngle,
} from './measurements'

describe('measurement math', () => {
  it('measures total and axis distances', () => {
    const a = { x: 0.1, y: 0.2 }
    const b = { x: 0.4, y: 0.6 }
    expect(measurePoints(a, b, 'distance')?.value).toBeCloseTo(0.5)
    expect(measurePoints(a, b, 'distanceX')?.value).toBeCloseTo(0.3)
    expect(measurePoints(a, b, 'distanceY')?.value).toBeCloseTo(0.4)
  })

  it('keeps horizontal in the middle and vertical at the ends', () => {
    expect(measurePoints({ x: 0, y: 0 }, { x: 1, y: 0 }, 'angle')?.value).toBe(0)
    expect(wrapUndirectedAngle(90)).toBe(-90)
    expect(wrapUndirectedAngle(-90)).toBe(-90)
  })

  it('unwraps the vertical seam without a sudden jump', () => {
    const values = [80, 89, -89, -80]
    const unwrapped: number[] = []
    for (const value of values) unwrapped.push(unwrapAngle(value, unwrapped.at(-1)))
    expect(unwrapped).toEqual([80, 89, 91, 100])
  })

  it('supports wrapped angle mode explicitly', () => {
    const value = measurePoints(
      { x: 0, y: 0 },
      { x: -0.01, y: 1 },
      'angle',
      'wrapped',
      89,
    )?.value
    expect(value).toBeLessThan(-89)
  })
})

describe('MIDI mapping', () => {
  it('clamps and rounds values', () => {
    expect(mapMeasurementToMidi(-1, 0, 1, 0, 127)).toBe(0)
    expect(mapMeasurementToMidi(0.5, 0, 1, 0, 127)).toBe(64)
    expect(mapMeasurementToMidi(2, 0, 1, 0, 127)).toBe(127)
  })

  it('supports reversed MIDI ranges', () => {
    expect(mapMeasurementToMidi(0, 0, 1, 127, 0)).toBe(127)
    expect(mapMeasurementToMidi(1, 0, 1, 127, 0)).toBe(0)
  })

  it('does not map an empty calibration range', () => {
    expect(mapMeasurementToMidi(0.5, 1, 1, 0, 127)).toBeNull()
  })
})

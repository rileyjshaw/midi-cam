import type { AngleMode, MeasurementType, Point2D } from './types'

export interface MeasurementResult {
  value: number
  angleState?: number
}

export function wrapUndirectedAngle(angle: number): number {
  return ((((angle + 90) % 180) + 180) % 180) - 90
}

export function unwrapAngle(wrapped: number, previous?: number): number {
  if (previous === undefined || !Number.isFinite(previous)) return wrapped
  return wrapped + 180 * Math.round((previous - wrapped) / 180)
}

export function measurePoints(
  a: Point2D,
  b: Point2D,
  type: MeasurementType,
  angleMode: AngleMode = 'continuous',
  previousAngle?: number,
): MeasurementResult | null {
  const dx = b.x - a.x
  const dy = b.y - a.y

  if (type === 'distance') return { value: Math.hypot(dx, dy) }
  if (type === 'distanceX') return { value: Math.abs(dx) }
  if (type === 'distanceY') return { value: Math.abs(dy) }
  if (Math.abs(dx) + Math.abs(dy) < 1e-7) return null

  const wrapped = wrapUndirectedAngle((Math.atan2(dy, dx) * 180) / Math.PI)
  const value = angleMode === 'continuous' ? unwrapAngle(wrapped, previousAngle) : wrapped
  return { value, angleState: value }
}

export function mapMeasurementToMidi(
  value: number,
  inputMin: number,
  inputMax: number,
  midiMin: number,
  midiMax: number,
): number | null {
  if (![value, inputMin, inputMax, midiMin, midiMax].every(Number.isFinite)) return null
  if (Math.abs(inputMax - inputMin) < 1e-9) return null
  const t = Math.min(1, Math.max(0, (value - inputMin) / (inputMax - inputMin)))
  return Math.min(127, Math.max(0, Math.round(midiMin + t * (midiMax - midiMin))))
}

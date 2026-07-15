import { defaultInputRange } from './landmarks'
import type { AppConfig, ConnectionConfig, MeasurementType } from './types'

export const COLOR_PALETTE = [
  '#FFFFFF', '#0A0A0C', '#9CA3AF', '#64748B', '#8B6F47', '#F5E6C8',
  '#FF4D6D', '#FF6B6B', '#FF8C42', '#FFB703', '#FDE047', '#D9F99D',
  '#84CC16', '#22C55E', '#10B981', '#14B8A6', '#22D3EE', '#38BDF8',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF', '#F472B6',
] as const

export function createConnection(
  existing: ConnectionConfig[],
  measurement: MeasurementType = 'distance',
): ConnectionConfig {
  const used = new Set(existing.map((connection) => connection.cc))
  let cc = 1
  while (cc < 127 && used.has(cc)) cc += 1
  const [inputMin, inputMax] = defaultInputRange(measurement)
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `control-${Date.now()}-${Math.random()}`,
    pointA: null,
    pointB: null,
    measurement,
    cc,
    midiMin: 0,
    midiMax: 127,
    inputMin,
    inputMax,
    calibrated: false,
    angleMode: 'continuous',
    color: COLOR_PALETTE[existing.length % COLOR_PALETTE.length],
    enabled: true,
  }
}

export function createDefaultConfig(): AppConfig {
  return {
    version: 1,
    maxPeople: 1,
    midiOutputId: null,
    connections: [],
  }
}

export function cloneConfig(config: AppConfig): AppConfig {
  return JSON.parse(JSON.stringify(config)) as AppConfig
}

export function shaderSignature(config: AppConfig): string {
  return JSON.stringify({
    maxPeople: config.maxPeople,
    connections: config.connections
      .filter((connection) => connection.enabled && connection.pointA && connection.pointB)
      .map(({ id, pointA, pointB, color, enabled }) => ({ id, pointA, pointB, color, enabled })),
  })
}

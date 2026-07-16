import { defaultInputRange } from './landmarks'
import type { AppConfig, ConnectionConfig, MeasurementType } from './types'

export const COLOR_PALETTE = [
  'transparent', '#FFFFFF', '#8C919B', '#0A0A0C', '#D4AF37', 'rainbow',
  '#FF334F', '#FFD60A', '#246BFD', '#8B5CF6', '#FF7A1A', '#20C866',
  '#FF6B6B', '#F472B6', '#D946EF', '#22D3EE', '#38BDF8', '#6EE7B7',
  '#9F1239', '#C65D3B', '#E5A93D', '#84CC16', '#0F766E', '#4F46E5',
] as const

export const COLOR_NAMES: Record<(typeof COLOR_PALETTE)[number], string> = {
  transparent: 'Invisible',
  '#FFFFFF': 'White',
  '#8C919B': 'Grey',
  '#0A0A0C': 'Black',
  '#D4AF37': 'Gold',
  rainbow: 'Rainbow',
  '#FF334F': 'Red',
  '#FFD60A': 'Yellow',
  '#246BFD': 'Blue',
  '#8B5CF6': 'Purple',
  '#FF7A1A': 'Orange',
  '#20C866': 'Green',
  '#FF6B6B': 'Coral',
  '#F472B6': 'Rose',
  '#D946EF': 'Magenta',
  '#22D3EE': 'Cyan',
  '#38BDF8': 'Sky',
  '#6EE7B7': 'Mint',
  '#9F1239': 'Burgundy',
  '#C65D3B': 'Terracotta',
  '#E5A93D': 'Amber',
  '#84CC16': 'Lime',
  '#0F766E': 'Deep teal',
  '#4F46E5': 'Indigo',
}

const DEFAULT_CONNECTION_COLORS = COLOR_PALETTE.filter((color) => color !== 'transparent')

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
    color: DEFAULT_CONNECTION_COLORS[existing.length % DEFAULT_CONNECTION_COLORS.length],
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

import { cloneConfig, createDefaultConfig } from './config'
import type { AppConfig, ConnectionConfig } from './types'

const WORKING_KEY = 'midi-cam:working:v1'
const SAVED_KEY = 'midi-cam:saved:v1'

function isConnection(value: unknown): value is ConnectionConfig {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ConnectionConfig>
  return (
    typeof item.id === 'string' &&
    (item.pointA === null || typeof item.pointA === 'string') &&
    (item.pointB === null || typeof item.pointB === 'string') &&
    ['distance', 'angle', 'distanceX', 'distanceY'].includes(item.measurement ?? '') &&
    typeof item.cc === 'number' &&
    typeof item.midiMin === 'number' &&
    typeof item.midiMax === 'number' &&
    typeof item.inputMin === 'number' &&
    typeof item.inputMax === 'number' &&
    typeof item.color === 'string' &&
    typeof item.enabled === 'boolean'
  )
}

function parseConfig(raw: string | null): AppConfig | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<AppConfig>
    if (
      value.version !== 1 ||
      typeof value.maxPeople !== 'number' ||
      value.maxPeople < 1 ||
      value.maxPeople > 4 ||
      !Array.isArray(value.connections) ||
      !value.connections.every(isConnection)
    ) {
      return null
    }
    return {
      version: 1,
      maxPeople: Math.round(value.maxPeople),
      midiOutputId: typeof value.midiOutputId === 'string' ? value.midiOutputId : null,
      connections: value.connections.map((connection) => ({
        ...connection,
        cc: Math.min(127, Math.max(0, Math.round(connection.cc))),
        midiMin: Math.min(127, Math.max(0, Math.round(connection.midiMin))),
        midiMax: Math.min(127, Math.max(0, Math.round(connection.midiMax))),
        calibrated: connection.calibrated === true,
        angleMode: connection.angleMode === 'wrapped' ? 'wrapped' : 'continuous',
      })),
    }
  } catch {
    return null
  }
}

export function loadWorkingConfig(): AppConfig {
  return parseConfig(localStorage.getItem(WORKING_KEY)) ?? createDefaultConfig()
}

export function persistWorkingConfig(config: AppConfig): void {
  localStorage.setItem(WORKING_KEY, JSON.stringify(config))
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(SAVED_KEY, JSON.stringify(config))
  persistWorkingConfig(config)
}

export function loadSavedConfig(): AppConfig | null {
  const saved = parseConfig(localStorage.getItem(SAVED_KEY))
  return saved ? cloneConfig(saved) : null
}

export function clearWorkingConfig(): AppConfig {
  const next = createDefaultConfig()
  persistWorkingConfig(next)
  return next
}

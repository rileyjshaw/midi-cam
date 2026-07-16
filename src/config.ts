import { defaultInputRange } from './landmarks';
import type { AppConfig, ConnectionConfig, MeasurementType } from './types';

export const COLOR_PALETTE = [
	'transparent',
	'#FFFFFF',
	'#8C919B',
	'#0A0A0C',
	'#D4AF37',
	'rainbow',
	'#FF334F',
	'#FFD60A',
	'#246BFD',
	'#1AB65D',
	'#67E8F9',
	'#F9A8D4',
	'#780C2D',
	'#FF7A1A',
	'#082A66',
	'#0B5D3B',
	'#A7F3D0',
	'#8B5CF6',
] as const;

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
	'#1AB65D': 'Green',
	'#67E8F9': 'Cyan',
	'#F9A8D4': 'Pink',
	'#780C2D': 'Burgundy',
	'#FF7A1A': 'Orange',
	'#082A66': 'Ocean',
	'#0B5D3B': 'Forest',
	'#A7F3D0': 'Mint',
	'#8B5CF6': 'Purple',
};

const LEGACY_COLORS: Record<string, string> = {
	'#22D3EE': '#67E8F9',
	'#D946EF': '#F9A8D4',
	'#6EE7B7': '#A7F3D0',
};

export function colorName(color: string): string {
	return COLOR_NAMES[color as keyof typeof COLOR_NAMES] ?? color;
}

export function migrateColor(color: string): string {
	return LEGACY_COLORS[color] ?? color;
}

const DEFAULT_CONNECTION_COLORS = COLOR_PALETTE.filter(color => color !== 'transparent');

export function createConnection(
	existing: ConnectionConfig[],
	measurement: MeasurementType = 'distance',
): ConnectionConfig {
	const used = new Set(existing.map(connection => connection.cc));
	let cc = 1;
	while (cc < 127 && used.has(cc)) cc += 1;
	const [inputMin, inputMax] = defaultInputRange(measurement);
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
		color: DEFAULT_CONNECTION_COLORS[existing.length % DEFAULT_CONNECTION_COLORS.length],
		enabled: true,
	};
}

export function createDefaultConfig(): AppConfig {
	return {
		version: 1,
		maxPeople: 1,
		midiOutputId: null,
		connections: [],
	};
}

export function cloneConfig(config: AppConfig): AppConfig {
	return structuredClone(config);
}

export function shaderSignature(config: AppConfig): string {
	return JSON.stringify({
		maxPeople: config.maxPeople,
		connections: config.connections
			.filter(connection => connection.enabled && connection.pointA && connection.pointB)
			.map(({ id, pointA, pointB, color, enabled }) => ({ id, pointA, pointB, color, enabled })),
	});
}

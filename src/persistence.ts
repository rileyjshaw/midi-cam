import { cloneConfig, createDefaultConfig } from './config';
import { clampMidiValue } from './numbers';
import type { AppConfig, ConnectionConfig } from './types';

const WORKING_KEY = 'midi-cam:working:v1';
const SAVED_KEY = 'midi-cam:saved:v1';
const NAMED_CONFIGS_KEY = 'midi-cam:named-configs:v1';

export interface NamedConfig {
	name: string;
	updatedAt: number;
	config: AppConfig;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function isConnection(value: unknown): value is ConnectionConfig {
	if (!value || typeof value !== 'object') return false;
	const item = value as Partial<ConnectionConfig>;
	return (
		typeof item.id === 'string' &&
		(item.pointA === null || typeof item.pointA === 'string') &&
		(item.pointB === null || typeof item.pointB === 'string') &&
		['distance', 'angle', 'distanceX', 'distanceY'].includes(item.measurement ?? '') &&
		isFiniteNumber(item.cc) &&
		isFiniteNumber(item.midiMin) &&
		isFiniteNumber(item.midiMax) &&
		isFiniteNumber(item.inputMin) &&
		isFiniteNumber(item.inputMax) &&
		typeof item.color === 'string' &&
		typeof item.enabled === 'boolean'
	);
}

function parseConfig(raw: string | null): AppConfig | null {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as Partial<AppConfig>;
		if (
			value.version !== 1 ||
			!isFiniteNumber(value.maxPeople) ||
			!Number.isInteger(value.maxPeople) ||
			value.maxPeople < 1 ||
			value.maxPeople > 4 ||
			!Array.isArray(value.connections) ||
			!value.connections.every(isConnection)
		) {
			return null;
		}
		return {
			version: 1,
			maxPeople: value.maxPeople,
			midiOutputId: typeof value.midiOutputId === 'string' ? value.midiOutputId : null,
			connections: value.connections.map(connection => ({
				id: connection.id,
				pointA: connection.pointA,
				pointB: connection.pointB,
				measurement: connection.measurement,
				cc: clampMidiValue(connection.cc),
				midiMin: clampMidiValue(connection.midiMin),
				midiMax: clampMidiValue(connection.midiMax),
				inputMin: connection.inputMin,
				inputMax: connection.inputMax,
				color: connection.color,
				enabled: connection.enabled,
			})),
		};
	} catch {
		return null;
	}
}

function readNamedConfigs(): NamedConfig[] {
	try {
		const value = JSON.parse(localStorage.getItem(NAMED_CONFIGS_KEY) ?? '[]') as unknown;
		if (!Array.isArray(value)) return [];
		return value.flatMap(entry => {
			if (!entry || typeof entry !== 'object') return [];
			const candidate = entry as Partial<NamedConfig>;
			if (typeof candidate.name !== 'string' || !candidate.name.trim()) return [];
			const config = parseConfig(JSON.stringify(candidate.config));
			if (!config) return [];
			return [
				{
					name: candidate.name.trim(),
					updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : 0,
					config,
				},
			];
		});
	} catch {
		return [];
	}
}

export function loadWorkingConfig(): AppConfig {
	return parseConfig(localStorage.getItem(WORKING_KEY)) ?? createDefaultConfig();
}

export function persistWorkingConfig(config: AppConfig): void {
	localStorage.setItem(WORKING_KEY, JSON.stringify(config));
}

export function listNamedConfigs(): NamedConfig[] {
	const named = readNamedConfigs();
	if (!named.length) {
		const legacy = parseConfig(localStorage.getItem(SAVED_KEY));
		if (legacy) named.push({ name: 'Saved configuration', updatedAt: 0, config: legacy });
	}
	return named
		.sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name))
		.map(entry => ({ ...entry, config: cloneConfig(entry.config) }));
}

export function saveNamedConfig(name: string, config: AppConfig): void {
	const normalizedName = name.trim();
	if (!normalizedName) throw new Error('A configuration name is required.');
	const entries = listNamedConfigs();
	const matchingIndex = entries.findIndex(
		entry => entry.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
	);
	const next: NamedConfig = {
		name: normalizedName,
		updatedAt: Date.now(),
		config: cloneConfig(config),
	};
	if (matchingIndex >= 0) entries.splice(matchingIndex, 1, next);
	else entries.push(next);
	localStorage.setItem(NAMED_CONFIGS_KEY, JSON.stringify(entries));
}

export function loadNamedConfig(name: string): AppConfig | null {
	const entry = listNamedConfigs().find(candidate => candidate.name === name);
	return entry ? cloneConfig(entry.config) : null;
}

export function deleteNamedConfig(name: string): void {
	const entries = listNamedConfigs().filter(entry => entry.name !== name);
	localStorage.setItem(NAMED_CONFIGS_KEY, JSON.stringify(entries));
	if (name === 'Saved configuration') localStorage.removeItem(SAVED_KEY);
}

export function clearWorkingConfig(): AppConfig {
	const next = createDefaultConfig();
	persistWorkingConfig(next);
	return next;
}

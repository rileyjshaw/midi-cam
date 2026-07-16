// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createConnection, createDefaultConfig } from './config';
import {
	deleteNamedConfig,
	listNamedConfigs,
	loadNamedConfig,
	loadWorkingConfig,
	persistWorkingConfig,
	saveNamedConfig,
} from './persistence';

describe('local configuration persistence', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.useRealTimers();
	});

	it('auto-saves and restores the unnamed current configuration', () => {
		const config = createDefaultConfig();
		config.maxPeople = 3;
		persistWorkingConfig(config);

		expect(loadWorkingConfig().maxPeople).toBe(3);
	});

	it('drops the legacy wrapped-angle option from stored configurations', () => {
		const legacyConnection = { ...createConnection([]), angleMode: 'wrapped' };
		localStorage.setItem(
			'midi-cam:working:v1',
			JSON.stringify({
				...createDefaultConfig(),
				connections: [legacyConnection],
			}),
		);

		expect(loadWorkingConfig().connections[0]).not.toHaveProperty('angleMode');
	});

	it('migrates replaced palette colors in stored configurations', () => {
		const legacyColors = ['#22D3EE', '#D946EF', '#6EE7B7', '#0B5D3B'];
		const connections = legacyColors.map((color, index) => ({
			...createConnection([]),
			id: `legacy-${index}`,
			color,
		}));
		localStorage.setItem('midi-cam:working:v1', JSON.stringify({ ...createDefaultConfig(), connections }));

		expect(loadWorkingConfig().connections.map(connection => connection.color)).toEqual([
			'#67E8F9',
			'#F9A8D4',
			'#A7F3D0',
			'#053824',
		]);
	});

	it('stores, replaces, loads, and deletes named configurations', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-15T20:00:00Z'));
		const config = createDefaultConfig();
		const connection = createConnection([]);
		connection.pointA = 'pose:11';
		connection.pointB = 'screen:center';
		config.connections = [connection];

		saveNamedConfig('Stage setup', config);
		expect(listNamedConfigs()).toHaveLength(1);
		expect(loadNamedConfig('Stage setup')?.connections).toHaveLength(1);

		config.maxPeople = 4;
		saveNamedConfig('stage setup', config);
		expect(listNamedConfigs()).toHaveLength(1);
		expect(loadNamedConfig('stage setup')?.maxPeople).toBe(4);

		deleteNamedConfig('stage setup');
		expect(listNamedConfigs()).toEqual([]);
	});
});

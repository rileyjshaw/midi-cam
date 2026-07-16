import { describe, expect, it } from 'vitest';
import { COLOR_NAMES, COLOR_PALETTE, createConnection } from './config';

describe('connection color palette', () => {
	it('keeps the requested utility, primary, and deep colors in three rows', () => {
		expect(COLOR_PALETTE.slice(0, 6)).toEqual([
			'transparent',
			'#FFFFFF',
			'#8C919B',
			'#0A0A0C',
			'#D4AF37',
			'rainbow',
		]);
		expect(COLOR_PALETTE.slice(6, 12).map(color => COLOR_NAMES[color])).toEqual([
			'Red',
			'Yellow',
			'Blue',
			'Green',
			'Cyan',
			'Pink',
		]);
		expect(COLOR_PALETTE.slice(12, 18).map(color => COLOR_NAMES[color])).toEqual([
			'Burgundy',
			'Orange',
			'Ocean',
			'Forest',
			'Mint',
			'Purple',
		]);
		expect(COLOR_PALETTE).toHaveLength(18);
		expect(COLOR_PALETTE[9]).toBe('#1AB65D');
		expect(COLOR_PALETTE[10]).toBe('#67E8F9');
		expect(COLOR_PALETTE[11]).toBe('#F9A8D4');
		expect(COLOR_PALETTE[12]).toBe('#780C2D');
		expect(COLOR_PALETTE[16]).toBe('#A7F3D0');
	});

	it('defaults new controls to a visible color', () => {
		expect(createConnection([]).color).toBe('#FFFFFF');
	});
});

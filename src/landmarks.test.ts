import { describe, expect, it } from 'vitest';
import { LANDMARK_GROUPS } from './landmarks';

describe('curated landmark groups', () => {
	it('keeps facial points out of the body group', () => {
		const body = LANDMARK_GROUPS.find(group => group.label === 'BODY');
		expect(body?.options.every(option => (option.index ?? 0) >= 11)).toBe(true);
		expect(body?.options[0]?.id).toBe('pose:11');
		expect(body?.options.map(option => option.id)).not.toContain('pose:31');
		expect(body?.options.map(option => option.id)).not.toContain('pose:32');
		const removedIndices = [15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30];
		expect(body?.options.some(option => removedIndices.includes(option.index ?? -1))).toBe(false);
		expect(body?.options.map(option => option.id)).toEqual(expect.arrayContaining(['pose:36', 'pose:37']));
	});

	it('offers eye centers and upper/lower eyelid points without corner variants', () => {
		const face = LANDMARK_GROUPS.find(group => group.label === 'FACE');
		const faceLabels = face?.options.map(option => option.label);

		expect(faceLabels).toEqual(
			expect.arrayContaining([
				'Left eye',
				'Upper left eye',
				'Lower left eye',
				'Right eye',
				'Upper right eye',
				'Lower right eye',
			]),
		);
		expect(Object.fromEntries(face?.options.map(option => [option.label, option.index]) ?? [])).toMatchObject({
			'Upper left eye': 386,
			'Lower left eye': 374,
			'Upper right eye': 159,
			'Lower right eye': 145,
		});
		expect(faceLabels?.some(label => /eye (center|inner|outer)/.test(label))).toBe(false);
	});

	it('offers only a base and tip for each finger', () => {
		const hand = LANDMARK_GROUPS.find(group => group.label === 'HAND');
		const leftHandIndices = hand?.options.filter(option => option.side === 'left').map(option => option.index);

		expect(leftHandIndices).toEqual([0, 2, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21]);
		expect(hand?.options.some(option => /\b(PIP|DIP|IP|CMC)\b/.test(option.label))).toBe(false);
	});

	it('uses sentence case for every landmark label', () => {
		for (const option of LANDMARK_GROUPS.flatMap(group => group.options)) {
			const [, ...remainingWords] = option.label.split(' ');
			expect(remainingWords.join(' ')).toBe(remainingWords.join(' ').toLowerCase());
		}
	});
});

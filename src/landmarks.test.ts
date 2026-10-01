import { describe, expect, it } from 'vitest';
import { BODY_TRACKING_BY_ID } from './body-tracking';
import { LANDMARK_DIAGRAMS } from './landmark-diagrams';
import { LANDMARK_GROUPS, LANDMARK_BY_ID, pluginSourcesForConnections } from './landmarks';

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
		expect(
			face?.options
				.filter(option => option.source === 'face')
				.some(option => /eye (center|inner|outer)/.test(option.label)),
		).toBe(false);
	});

	it('offers only a base and tip for each finger', () => {
		const hand = LANDMARK_GROUPS.find(group => group.label === 'HAND');
		const leftHandIndices = hand?.options
			.filter(option => option.side === 'left' && option.source === 'hand')
			.map(option => option.index);

		expect(leftHandIndices).toEqual([0, 2, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21]);
		expect(hand?.options.some(option => /\b(PIP|DIP|IP|CMC)\b/.test(option.label))).toBe(false);
	});

	it('uses sentence case for every landmark label', () => {
		for (const option of LANDMARK_GROUPS.flatMap(group => group.options)) {
			const [, ...remainingWords] = option.label.split(' ');
			expect(remainingWords.join(' ')).toBe(remainingWords.join(' ').toLowerCase());
		}
	});
	it('offers only body-tracked alternatives with a detailed model counterpart', () => {
		const indices = [0, 2, 5, 9, 10, 15, 16, 17, 18, 19, 20, 21, 22, 34, 35];
		for (const index of indices) {
			expect(LANDMARK_BY_ID.get(`pose:${index}`)).toMatchObject({ source: 'pose', index });
		}
		expect([...pluginSourcesForConnections(indices.map(index => `pose:${index}`))]).toEqual(['pose']);
		for (const index of [1, 3, 4, 6, 7, 8]) expect(LANDMARK_BY_ID.has(`pose:${index}`)).toBe(false);
		const options = LANDMARK_GROUPS.flatMap(group => group.options);
		expect(LANDMARK_BY_ID.size).toBe(options.length);
	});
	it('keeps mouth model switches on the same anatomical side', () => {
		// MediaPipe canonical mesh: 61 lies on the right (same side as eye 159), 291 on the left (eye 386).
		for (const [poseId, faceId, side] of [
			['pose:9', 'face:291', 'Left'],
			['pose:10', 'face:61', 'Right'],
		]) {
			expect(BODY_TRACKING_BY_ID.get(poseId)?.detailedId).toBe(faceId);
			expect(LANDMARK_BY_ID.get(faceId)?.label).toBe(`${side} mouth corner`);
			const point = LANDMARK_DIAGRAMS.face.points.find(point => point.id === faceId)!;
			expect(point.x > 120).toBe(side === 'Left');
		}
		expect(LANDMARK_BY_ID.get('face:280')?.label).toBe('Left cheek');
		expect(LANDMARK_BY_ID.get('face:50')?.label).toBe('Right cheek');
	});
});

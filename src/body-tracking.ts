export interface BodyTrackingOption {
	poseId: string;
	detailedId: string;
	label: string;
	view: 'face' | 'left-hand' | 'right-hand';
}

export const BODY_TRACKING_OPTIONS: BodyTrackingOption[] = [
	{ poseId: 'pose:0', detailedId: 'face:4', label: 'Nose', view: 'face' },
	{ poseId: 'pose:2', detailedId: 'face:473', label: 'Left eye', view: 'face' },
	{ poseId: 'pose:5', detailedId: 'face:468', label: 'Right eye', view: 'face' },
	{ poseId: 'pose:9', detailedId: 'face:291', label: 'Left mouth corner', view: 'face' },
	{ poseId: 'pose:10', detailedId: 'face:61', label: 'Right mouth corner', view: 'face' },
	{ poseId: 'pose:39', detailedId: 'face:478', label: 'Face center', view: 'face' },
	...(['left', 'right'] as const).flatMap((side, offset) =>
		[
			{ index: 15 + offset, handIndex: 0, label: 'Wrist' },
			{ index: 17 + offset, handIndex: 20, label: 'Pinky' },
			{ index: 19 + offset, handIndex: 8, label: 'Index' },
			{ index: 21 + offset, handIndex: 4, label: 'Thumb' },
			{ index: 34 + offset, handIndex: 21, label: 'Hand center' },
		].map(({ index, handIndex, label }) => ({
			poseId: `pose:${index}`,
			detailedId: `hand:${side}:${handIndex}`,
			label,
			view: `${side}-hand` as const,
		})),
	),
];

export const BODY_TRACKING_BY_ID = new Map(BODY_TRACKING_OPTIONS.map(option => [option.poseId, option]));

export function bodyTrackingOption(id: string | null | undefined) {
	if (!id) return undefined;
	return BODY_TRACKING_OPTIONS.find(option => option.poseId === id || option.detailedId === id);
}

import { BODY_TRACKING_BY_ID } from './body-tracking';

export type LandmarkView = 'body' | 'left-hand' | 'right-hand' | 'face' | 'screen';

export interface DiagramPoint {
	id: string;
	x: number;
	y: number;
	view?: LandmarkView;
	label?: string;
}

interface LandmarkDiagram {
	label: string;
	points: DiagramPoint[];
	paths: string[];
}

const body: LandmarkDiagram = {
	label: 'Body',
	points: [
		{ id: 'face:478', x: 120, y: 39, view: 'face', label: 'Face' },
		{ id: 'pose:12', x: 88, y: 88 },
		{ id: 'pose:11', x: 152, y: 88 },
		{ id: 'pose:14', x: 61, y: 132 },
		{ id: 'pose:13', x: 179, y: 132 },
		{ id: 'pose:35', x: 35, y: 177, view: 'right-hand', label: 'Right hand' },
		{ id: 'pose:34', x: 205, y: 177, view: 'left-hand', label: 'Left hand' },
		{ id: 'pose:38', x: 120, y: 119 },
		{ id: 'pose:33', x: 120, y: 160 },
		{ id: 'pose:24', x: 96, y: 182 },
		{ id: 'pose:23', x: 144, y: 182 },
		{ id: 'pose:26', x: 86, y: 234 },
		{ id: 'pose:25', x: 154, y: 234 },
		{ id: 'pose:37', x: 77, y: 290 },
		{ id: 'pose:36', x: 163, y: 290 },
	],
	paths: [
		'M 120 61 V 79 M 88 88 L 120 79 L 152 88 L 144 182 H 96 Z',
		'M 88 88 L 61 132 L 35 177 M 152 88 L 179 132 L 205 177',
		'M 96 182 L 86 234 L 77 290 H 63 M 144 182 L 154 234 L 163 290 H 177',
		'M 120 79 V 160 M 96 182 L 120 160 L 144 182',
		'M 120 17 C 91 17 91 61 120 61 C 149 61 149 17 120 17 Z',
	],
};

function hand(side: 'left' | 'right'): LandmarkDiagram {
	const coordinates = [
		[0, 120, 285],
		[2, 72, 214],
		[4, 26, 170],
		[5, 86, 159],
		[8, 68, 49],
		[9, 122, 148],
		[12, 122, 27],
		[13, 157, 160],
		[16, 171, 48],
		[17, 184, 184],
		[20, 215, 102],
		[21, 132, 212],
	];
	return {
		label: `${side === 'left' ? 'Left' : 'Right'} hand`,
		points: coordinates.map(([index, x, y]) => ({ id: `hand:${side}:${index}`, x, y })),
		paths: [
			'M 120 285 L 72 214 L 47 191 L 26 170',
			'M 120 285 L 86 159 L 79 116 L 73 78 L 68 49',
			'M 86 159 L 122 148 L 122 102 L 122 60 L 122 27',
			'M 122 148 L 157 160 L 162 114 L 167 76 L 171 48',
			'M 157 160 L 184 184 L 195 150 L 206 124 L 215 102',
			'M 184 184 L 120 285 M 72 214 L 86 159',
		],
	};
}

const face: LandmarkDiagram = {
	label: 'Face',
	points: [
		{ id: 'face:10', x: 120, y: 35 },
		{ id: 'face:105', x: 66, y: 85 },
		{ id: 'face:334', x: 174, y: 85 },
		{ id: 'face:159', x: 66, y: 111 },
		{ id: 'face:386', x: 174, y: 111 },
		{ id: 'face:468', x: 66, y: 138 },
		{ id: 'face:473', x: 174, y: 138 },
		{ id: 'face:145', x: 66, y: 165 },
		{ id: 'face:374', x: 174, y: 165 },
		{ id: 'face:168', x: 120, y: 113 },
		{ id: 'face:478', x: 120, y: 150 },
		{ id: 'face:4', x: 120, y: 188 },
		{ id: 'face:50', x: 39, y: 197 },
		{ id: 'face:280', x: 201, y: 197 },
		{ id: 'face:13', x: 120, y: 218 },
		{ id: 'face:14', x: 120, y: 270 },
		{ id: 'face:61', x: 78, y: 244 },
		{ id: 'face:291', x: 162, y: 244 },
		{ id: 'face:479', x: 120, y: 244 },
		{ id: 'face:152', x: 120, y: 300 },
	],
	paths: [
		'M 120 20 C 17 20 19 97 25 169 C 29 232 69 300 120 300 C 171 300 211 232 215 169 C 221 97 223 20 120 20 Z',
		'M 39 91 Q 66 78 93 91 M 147 91 Q 174 78 201 91',
		'M 39 138 Q 66 84 93 138 Q 66 192 39 138 Z M 147 138 Q 174 84 201 138 Q 174 192 147 138 Z',
		'M 120 113 L 102 188 H 138 Z',
		'M 78 244 L 120 218 L 162 244 L 120 270 Z M 78 244 H 162',
	],
};

export const LANDMARK_DIAGRAMS: Record<LandmarkView, LandmarkDiagram> = {
	body,
	'left-hand': hand('left'),
	'right-hand': hand('right'),
	face,
	screen: {
		label: 'Screen',
		points: ['top', 'center', 'bottom'].flatMap((row, y) =>
			['left', 'center', 'right'].map((column, x) => ({
				id: `screen:${row === 'center' && column === 'center' ? 'center' : `${row}-${column}`}`,
				x: 30 + x * 90,
				y: 70 + y * 90,
			})),
		),
		paths: ['M 30 70 H 210 V 250 H 30 Z', 'M 120 70 V 250 M 30 160 H 210'],
	},
};

export function landmarkView(id: string | null | undefined): LandmarkView {
	const bodyTracking = id ? BODY_TRACKING_BY_ID.get(id) : undefined;
	if (bodyTracking) return bodyTracking.view;
	if (id?.startsWith('hand:left:')) return 'left-hand';
	if (id?.startsWith('hand:right:')) return 'right-hand';
	if (id?.startsWith('face:')) return 'face';
	if (id?.startsWith('screen:')) return 'screen';
	return 'body';
}

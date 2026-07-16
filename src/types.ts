import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export type LandmarkSource = 'hand' | 'face' | 'pose' | 'screen';
export type HandSide = 'left' | 'right';
export type MeasurementType = 'distance' | 'angle' | 'distanceX' | 'distanceY';

export interface Point2D {
	x: number;
	y: number;
}

export interface LandmarkOption {
	id: string;
	label: string;
	detail?: string;
	source: LandmarkSource;
	index?: number;
	side?: HandSide;
	screenPoint?: Point2D;
	searchText: string;
}

export interface LandmarkGroup {
	label: string;
	options: LandmarkOption[];
}

export interface ConnectionConfig {
	id: string;
	pointA: string | null;
	pointB: string | null;
	measurement: MeasurementType;
	cc: number;
	midiMin: number;
	midiMax: number;
	inputMin: number;
	inputMax: number;
	calibrated: boolean;
	color: string;
	enabled: boolean;
}

export interface AppConfig {
	version: 1;
	maxPeople: number;
	midiOutputId: string | null;
	connections: ConnectionConfig[];
}

export interface PersonAssignment {
	slot: number;
	active: boolean;
	poseIndex: number;
	faceIndex: number;
	leftHandIndex: number;
	rightHandIndex: number;
	anchor: Point2D | null;
}

export interface VisionSnapshots {
	poses: NormalizedLandmark[][];
	faces: NormalizedLandmark[][];
	hands: NormalizedLandmark[][];
	handedness: Array<'left' | 'right' | null>;
}

export interface MeasurementSample {
	connectionId: string;
	personIndex: number;
	rawValue: number;
	midiValue: number | null;
}

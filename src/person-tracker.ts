import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { LandmarkOption, PersonAssignment, Point2D, VisionSnapshots } from './types';

interface Candidate {
	anchor: Point2D;
	poseIndex: number;
	faceIndex: number;
	leftHandIndex: number;
	rightHandIndex: number;
}

interface SlotMemory {
	anchor: Point2D | null;
	lastSeen: number;
}

const distance = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);

function point(landmark: NormalizedLandmark | undefined): Point2D | null {
	return landmark ? { x: 1 - landmark.x, y: 1 - landmark.y } : null;
}

function boundsCenter(landmarks: NormalizedLandmark[] | undefined, indices?: number[]): Point2D | null {
	if (!landmarks?.length) return null;
	const selected = indices?.length ? indices.map(index => landmarks[index]).filter(Boolean) : landmarks;
	if (!selected.length) return null;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const landmark of selected) {
		const mirroredX = 1 - landmark.x;
		minX = Math.min(minX, mirroredX);
		maxX = Math.max(maxX, mirroredX);
		minY = Math.min(minY, 1 - landmark.y);
		maxY = Math.max(maxY, 1 - landmark.y);
	}
	return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function handCenter(hand: NormalizedLandmark[] | undefined): Point2D | null {
	return boundsCenter(hand, [0, 5, 9, 13, 17]);
}

function nearestAvailable(
	target: Point2D,
	indices: number[],
	getPoint: (index: number) => Point2D | null,
	used: Set<number>,
): number {
	let best = -1;
	let bestDistance = Infinity;
	for (const index of indices) {
		if (used.has(index)) continue;
		const candidatePoint = getPoint(index);
		if (!candidatePoint) continue;
		const candidateDistance = distance(target, candidatePoint);
		if (candidateDistance < bestDistance) {
			bestDistance = candidateDistance;
			best = index;
		}
	}
	if (best >= 0) used.add(best);
	return best;
}

function createCandidates(snapshots: VisionSnapshots, maxPeople: number): Candidate[] {
	const poseIndices = snapshots.poses.map((_, index) => index);
	const faceIndices = snapshots.faces.map((_, index) => index);
	const leftHands = snapshots.hands.map((_, index) => index).filter(index => snapshots.handedness[index] === 'left');
	const rightHands = snapshots.hands
		.map((_, index) => index)
		.filter(index => snapshots.handedness[index] === 'right');

	if (poseIndices.length) {
		const candidates = poseIndices.slice(0, maxPeople).map(poseIndex => ({
			anchor: boundsCenter(snapshots.poses[poseIndex], [11, 12, 23, 24]) ?? { x: 0.5, y: 0.5 },
			poseIndex,
			faceIndex: -1,
			leftHandIndex: -1,
			rightHandIndex: -1,
		}));
		const usedFaces = new Set<number>();
		const usedLeft = new Set<number>();
		const usedRight = new Set<number>();
		for (const candidate of candidates) {
			const pose = snapshots.poses[candidate.poseIndex];
			const headTarget = point(pose?.[0]) ?? candidate.anchor;
			candidate.faceIndex = nearestAvailable(
				headTarget,
				faceIndices,
				index => boundsCenter(snapshots.faces[index]),
				usedFaces,
			);
			candidate.leftHandIndex = nearestAvailable(
				point(pose?.[15]) ?? candidate.anchor,
				leftHands,
				index => handCenter(snapshots.hands[index]),
				usedLeft,
			);
			candidate.rightHandIndex = nearestAvailable(
				point(pose?.[16]) ?? candidate.anchor,
				rightHands,
				index => handCenter(snapshots.hands[index]),
				usedRight,
			);
		}
		return candidates;
	}

	if (faceIndices.length) {
		const candidates = faceIndices.slice(0, maxPeople).map(faceIndex => ({
			anchor: boundsCenter(snapshots.faces[faceIndex]) ?? { x: 0.5, y: 0.5 },
			poseIndex: -1,
			faceIndex,
			leftHandIndex: -1,
			rightHandIndex: -1,
		}));
		const usedLeft = new Set<number>();
		const usedRight = new Set<number>();
		for (const candidate of candidates) {
			candidate.leftHandIndex = nearestAvailable(
				candidate.anchor,
				leftHands,
				index => handCenter(snapshots.hands[index]),
				usedLeft,
			);
			candidate.rightHandIndex = nearestAvailable(
				candidate.anchor,
				rightHands,
				index => handCenter(snapshots.hands[index]),
				usedRight,
			);
		}
		return candidates;
	}

	const candidates: Candidate[] = [];
	const unusedRight = new Set(rightHands);
	for (const leftHandIndex of leftHands) {
		const leftCenter = handCenter(snapshots.hands[leftHandIndex]);
		if (!leftCenter) continue;
		let rightHandIndex = -1;
		let bestDistance = Infinity;
		for (const index of unusedRight) {
			const rightCenter = handCenter(snapshots.hands[index]);
			if (!rightCenter) continue;
			const nextDistance = distance(leftCenter, rightCenter);
			if (nextDistance < bestDistance) {
				bestDistance = nextDistance;
				rightHandIndex = index;
			}
		}
		if (rightHandIndex >= 0) unusedRight.delete(rightHandIndex);
		const rightCenter = rightHandIndex >= 0 ? handCenter(snapshots.hands[rightHandIndex]) : null;
		candidates.push({
			anchor: rightCenter
				? { x: (leftCenter.x + rightCenter.x) / 2, y: (leftCenter.y + rightCenter.y) / 2 }
				: leftCenter,
			poseIndex: -1,
			faceIndex: -1,
			leftHandIndex,
			rightHandIndex,
		});
	}
	for (const rightHandIndex of unusedRight) {
		const anchor = handCenter(snapshots.hands[rightHandIndex]);
		if (anchor) {
			candidates.push({
				anchor,
				poseIndex: -1,
				faceIndex: -1,
				leftHandIndex: -1,
				rightHandIndex,
			});
		}
	}
	return candidates.slice(0, maxPeople);
}

export class PersonTracker {
	private slots: SlotMemory[];
	private readonly maxPeople: number;

	constructor(maxPeople: number) {
		this.maxPeople = maxPeople;
		this.slots = Array.from({ length: maxPeople }, () => ({ anchor: null, lastSeen: 0 }));
	}

	update(snapshots: VisionSnapshots, now = performance.now()): PersonAssignment[] {
		const candidates = createCandidates(snapshots, this.maxPeople);
		const assignments: PersonAssignment[] = Array.from({ length: this.maxPeople }, (_, slot) => ({
			slot,
			active: false,
			poseIndex: -1,
			faceIndex: -1,
			leftHandIndex: -1,
			rightHandIndex: -1,
			anchor: null,
		}));
		const usedSlots = new Set<number>();
		const usedCandidates = new Set<number>();
		const possibleMatches: Array<{ slot: number; candidate: number; distance: number }> = [];

		for (let slot = 0; slot < this.slots.length; slot += 1) {
			const memory = this.slots[slot];
			if (!memory.anchor || now - memory.lastSeen > 1500) continue;
			const anchor = memory.anchor;
			candidates.forEach((candidate, candidateIndex) => {
				possibleMatches.push({
					slot,
					candidate: candidateIndex,
					distance: distance(anchor, candidate.anchor),
				});
			});
		}
		possibleMatches.sort((a, b) => a.distance - b.distance);
		for (const match of possibleMatches) {
			if (match.distance > 0.45 || usedSlots.has(match.slot) || usedCandidates.has(match.candidate)) continue;
			usedSlots.add(match.slot);
			usedCandidates.add(match.candidate);
			assignments[match.slot] = { slot: match.slot, active: true, ...candidates[match.candidate] };
		}

		const remaining = candidates
			.map((candidate, index) => ({ candidate, index }))
			.filter(({ index }) => !usedCandidates.has(index))
			.sort((a, b) => a.candidate.anchor.x - b.candidate.anchor.x);
		for (const { candidate } of remaining) {
			const slot = assignments.findIndex(assignment => !assignment.active);
			if (slot < 0) break;
			assignments[slot] = { slot, active: true, ...candidate };
		}

		for (const assignment of assignments) {
			if (!assignment.active || !assignment.anchor) continue;
			this.slots[assignment.slot] = { anchor: assignment.anchor, lastSeen: now };
		}
		return assignments;
	}
}

function poseDerived(index: number, pose: NormalizedLandmark[]): Point2D | null {
	if (index < 33) return point(pose[index]);
	if (index === 39) {
		const face = pose.slice(0, 11);
		if (face.length !== 11 || face.some(landmark => (landmark.visibility ?? 1) < 0.35)) return null;
		return boundsCenter(face);
	}
	const groups: Record<number, number[]> = {
		33: Array.from({ length: 33 }, (_, i) => i),
		34: [15, 17, 19, 21],
		35: [16, 18, 20, 22],
		36: [27, 29, 31],
		37: [28, 30, 32],
		38: [11, 12, 23, 24],
	};
	const indices = groups[index];
	if (!indices || indices.some(index => !pose[index])) return null;
	// ShaderPad stores the mean visibility in each derived pose landmark's w component.
	const visibility = indices.reduce((sum, index) => sum + (pose[index].visibility ?? 1), 0) / indices.length;
	return visibility < 0.35 ? null : boundsCenter(pose, indices);
}

function faceDerived(index: number, face: NormalizedLandmark[]): Point2D | null {
	if (index < 478) return point(face[index]);
	if (index === 478) return boundsCenter(face);
	return boundsCenter(face, [13, 14, 61, 78, 291, 308]);
}

export function resolveLandmark(
	option: LandmarkOption,
	assignment: PersonAssignment,
	snapshots: VisionSnapshots,
): Point2D | null {
	if (option.source === 'screen') return option.screenPoint ?? null;
	if (option.source === 'pose' && assignment.poseIndex >= 0 && option.index !== undefined) {
		const pose = snapshots.poses[assignment.poseIndex];
		if (!pose) return null;
		const landmark = option.index < 33 ? pose[option.index] : undefined;
		if (landmark?.visibility !== undefined && landmark.visibility < 0.35) return null;
		return poseDerived(option.index, pose);
	}
	if (option.source === 'face' && assignment.faceIndex >= 0 && option.index !== undefined) {
		const face = snapshots.faces[assignment.faceIndex];
		return face ? faceDerived(option.index, face) : null;
	}
	if (option.source === 'hand' && option.index !== undefined) {
		const handIndex = option.side === 'left' ? assignment.leftHandIndex : assignment.rightHandIndex;
		if (handIndex < 0) return null;
		const hand = snapshots.hands[handIndex];
		return option.index === 21 ? handCenter(hand) : point(hand?.[option.index]);
	}
	return null;
}

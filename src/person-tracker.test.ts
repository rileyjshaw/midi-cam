import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { describe, expect, it } from 'vitest'
import { LANDMARK_BY_ID } from './landmarks'
import { PersonTracker, resolveLandmark } from './person-tracker'
import type { PersonAssignment, VisionSnapshots } from './types'

function landmarksAt(x: number, y: number, count: number): NormalizedLandmark[] {
  return Array.from({ length: count }, () => ({ x, y, z: 0, visibility: 1 }))
}

function snapshot(partial: Partial<VisionSnapshots>): VisionSnapshots {
  return { poses: [], faces: [], hands: [], handedness: [], ...partial }
}

describe('person assignment', () => {
  it('associates a face and two handed hands with one pose', () => {
    const tracker = new PersonTracker(1)
    const assignments = tracker.update(snapshot({
      poses: [landmarksAt(0.4, 0.5, 33)],
      faces: [landmarksAt(0.4, 0.2, 478)],
      hands: [landmarksAt(0.3, 0.5, 21), landmarksAt(0.5, 0.5, 21)],
      handedness: ['left', 'right'],
    }), 100)
    expect(assignments[0]).toMatchObject({
      active: true,
      poseIndex: 0,
      faceIndex: 0,
      leftHandIndex: 0,
      rightHandIndex: 1,
    })
  })

  it('keeps MIDI channel slots stable when detector array order changes', () => {
    const tracker = new PersonTracker(2)
    const first = tracker.update(snapshot({
      poses: [landmarksAt(0.2, 0.5, 33), landmarksAt(0.8, 0.5, 33)],
    }), 100)
    expect(first[0].anchor?.x).toBeCloseTo(0.2)
    expect(first[1].anchor?.x).toBeCloseTo(0.8)

    const second = tracker.update(snapshot({
      poses: [landmarksAt(0.78, 0.5, 33), landmarksAt(0.22, 0.5, 33)],
    }), 150)
    expect(second[0].poseIndex).toBe(0)
    expect(second[1].poseIndex).toBe(1)
  })

  it('pairs left and right hands when hands are the only active plugin', () => {
    const tracker = new PersonTracker(2)
    const assignments = tracker.update(snapshot({
      hands: [
        landmarksAt(0.2, 0.5, 21),
        landmarksAt(0.3, 0.5, 21),
        landmarksAt(0.75, 0.5, 21),
        landmarksAt(0.85, 0.5, 21),
      ],
      handedness: ['left', 'right', 'left', 'right'],
    }), 100)
    expect(assignments[0]).toMatchObject({ leftHandIndex: 2, rightHandIndex: 3 })
    expect(assignments[1]).toMatchObject({ leftHandIndex: 0, rightHandIndex: 1 })
  })

  it('mirrors tracked landmarks into display coordinates but leaves screen anchors fixed', () => {
    const assignment: PersonAssignment = {
      slot: 0,
      active: true,
      poseIndex: 0,
      faceIndex: -1,
      leftHandIndex: -1,
      rightHandIndex: -1,
      anchor: null,
    }
    const snapshots = snapshot({ poses: [landmarksAt(0.25, 0.4, 33)] })

    expect(resolveLandmark(LANDMARK_BY_ID.get('pose:15')!, assignment, snapshots)).toEqual({
      x: 0.75,
      y: 0.6,
    })
    expect(resolveLandmark(LANDMARK_BY_ID.get('screen:top-left')!, assignment, snapshots)).toEqual({
      x: 0,
      y: 1,
    })
  })
})

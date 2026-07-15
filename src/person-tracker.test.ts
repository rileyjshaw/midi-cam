import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { describe, expect, it } from 'vitest'
import { PersonTracker } from './person-tracker'
import type { VisionSnapshots } from './types'

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
    expect(first.map((assignment) => assignment.anchor?.x)).toEqual([0.2, 0.8])

    const second = tracker.update(snapshot({
      poses: [landmarksAt(0.78, 0.5, 33), landmarksAt(0.22, 0.5, 33)],
    }), 150)
    expect(second[0].poseIndex).toBe(1)
    expect(second[1].poseIndex).toBe(0)
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
    expect(assignments[0]).toMatchObject({ leftHandIndex: 0, rightHandIndex: 1 })
    expect(assignments[1]).toMatchObject({ leftHandIndex: 2, rightHandIndex: 3 })
  })
})

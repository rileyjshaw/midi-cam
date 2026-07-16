import type {
  LandmarkGroup,
  LandmarkOption,
  LandmarkSource,
  MeasurementType,
  Point2D,
} from './types'

const HAND_LANDMARKS = [
  [0, 'wrist'],
  [2, 'thumb base'],
  [4, 'thumb tip'],
  [5, 'index base'],
  [8, 'index tip'],
  [9, 'middle base'],
  [12, 'middle tip'],
  [13, 'ring base'],
  [16, 'ring tip'],
  [17, 'pinky base'],
  [20, 'pinky tip'],
  [21, 'hand center'],
] as const

const FACE_LANDMARKS = [
  [478, 'Face center'],
  [10, 'Forehead'],
  [334, 'Left eyebrow'],
  [105, 'Right eyebrow'],
  [473, 'Left eye center'],
  [362, 'Left eye inner corner'],
  [263, 'Left eye outer corner'],
  [468, 'Right eye center'],
  [133, 'Right eye inner corner'],
  [33, 'Right eye outer corner'],
  [168, 'Nose bridge'],
  [4, 'Nose tip'],
  [234, 'Left cheek'],
  [454, 'Right cheek'],
  [479, 'Mouth center'],
  [61, 'Left mouth corner'],
  [291, 'Right mouth corner'],
  [13, 'Upper lip'],
  [14, 'Lower lip'],
  [152, 'Chin'],
] as const

const POSE_LANDMARKS = [
  [11, 'Left shoulder'],
  [12, 'Right shoulder'],
  [13, 'Left elbow'],
  [14, 'Right elbow'],
  [15, 'Left wrist'],
  [16, 'Right wrist'],
  [17, 'Left pinky'],
  [18, 'Right pinky'],
  [19, 'Left index'],
  [20, 'Right index'],
  [21, 'Left thumb'],
  [22, 'Right thumb'],
  [23, 'Left hip'],
  [24, 'Right hip'],
  [25, 'Left knee'],
  [26, 'Right knee'],
  [27, 'Left ankle'],
  [28, 'Right ankle'],
  [29, 'Left heel'],
  [30, 'Right heel'],
  [33, 'Body center'],
  [34, 'Left hand center'],
  [35, 'Right hand center'],
  [36, 'Left foot center'],
  [37, 'Right foot center'],
  [38, 'Torso center'],
] as const

const SCREEN_POINTS: Array<[string, Point2D]> = [
  ['Top left', { x: 0, y: 1 }],
  ['Top center', { x: 0.5, y: 1 }],
  ['Top right', { x: 1, y: 1 }],
  ['Center left', { x: 0, y: 0.5 }],
  ['Center', { x: 0.5, y: 0.5 }],
  ['Center right', { x: 1, y: 0.5 }],
  ['Bottom left', { x: 0, y: 0 }],
  ['Bottom center', { x: 0.5, y: 0 }],
  ['Bottom right', { x: 1, y: 0 }],
]

function makeOption(
  id: string,
  label: string,
  source: LandmarkSource,
  extras: Partial<LandmarkOption> = {},
): LandmarkOption {
  const detail = extras.detail ?? source.toUpperCase()
  return {
    id,
    label,
    source,
    searchText: `${label} ${detail} ${id}`.toLowerCase(),
    ...extras,
    detail,
  }
}

const handOptions = (side: 'left' | 'right') =>
  HAND_LANDMARKS.map(([index, name]) =>
    makeOption(`hand:${side}:${index}`, `${side === 'left' ? 'Left' : 'Right'} ${name}`, 'hand', {
      index,
      side,
      detail: `HAND · ${side.toUpperCase()}`,
    }),
  )

export const LANDMARK_GROUPS: LandmarkGroup[] = [
  {
    label: 'HAND',
    options: [...handOptions('left'), ...handOptions('right')],
  },
  {
    label: 'FACE',
    options: FACE_LANDMARKS.map(([index, label]) =>
      makeOption(`face:${index}`, label, 'face', { index, detail: `FACE · ${index}` }),
    ),
  },
  {
    label: 'BODY',
    options: POSE_LANDMARKS.map(([index, label]) =>
      makeOption(`pose:${index}`, label, 'pose', { index, detail: `BODY · ${index}` }),
    ),
  },
  {
    label: 'SCREEN',
    options: SCREEN_POINTS.map(([label, screenPoint]) =>
      makeOption(`screen:${label.toLowerCase().replaceAll(' ', '-')}`, label, 'screen', {
        screenPoint,
        detail: 'SCREEN',
      }),
    ),
  },
]

export const LANDMARK_OPTIONS = LANDMARK_GROUPS.flatMap((group) => group.options)
export const LANDMARK_BY_ID = new Map(LANDMARK_OPTIONS.map((option) => [option.id, option]))

export const MEASUREMENT_LABELS: Record<MeasurementType, string> = {
  distance: 'Distance',
  angle: 'Angle',
  distanceX: 'Distance X',
  distanceY: 'Distance Y',
}

export const MEASUREMENT_ORDER: MeasurementType[] = [
  'distance',
  'angle',
  'distanceX',
  'distanceY',
]

export function defaultInputRange(type: MeasurementType): [number, number] {
  if (type === 'angle') return [-90, 90]
  if (type === 'distance') return [0, Math.SQRT2]
  return [0, 1]
}

export function pluginSourcesForConnections(pointIds: Array<string | null>): Set<LandmarkSource> {
  const sources = new Set<LandmarkSource>()
  for (const pointId of pointIds) {
    const point = pointId ? LANDMARK_BY_ID.get(pointId) : undefined
    if (point) sources.add(point.source)
  }
  return sources
}

import type {
  FaceLandmarkerResult,
  HandLandmarkerResult,
  PoseLandmarkerResult,
} from '@mediapipe/tasks-vision'
import ShaderPad, { type Plugin } from 'shaderpad'
import autosize from 'shaderpad/plugins/autosize'
import face from 'shaderpad/plugins/face'
import hands from 'shaderpad/plugins/hands'
import helpers from 'shaderpad/plugins/helpers'
import pose from 'shaderpad/plugins/pose'
import { LANDMARK_BY_ID, pluginSourcesForConnections } from './landmarks'
import { mapMeasurementToMidi, measurePoints } from './measurements'
import { PersonTracker, resolveLandmark } from './person-tracker'
import type {
  AppConfig,
  LandmarkOption,
  LandmarkSource,
  MeasurementSample,
  PersonAssignment,
  VisionSnapshots,
} from './types'

interface ShaderRuntimeOptions {
  canvas: HTMLCanvasElement
  video: HTMLVideoElement
  config: AppConfig
  getConfig: () => AppConfig
  onMeasurements: (samples: MeasurementSample[]) => void
  onStatus?: (status: string) => void
}

export interface ShaderRuntime {
  destroy: () => void
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  const parsed = Number.parseInt(value.length === 3 ? value.split('').map((char) => char + char).join('') : value, 16)
  return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255]
}

function float(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : value.toFixed(6)
}

function endpointCode(
  option: LandmarkOption,
  personIndex: number,
  pointName: string,
  validName: string,
): string {
  if (option.source === 'screen' && option.screenPoint) {
    return `${pointName} = vec2(${float(option.screenPoint.x)}, ${float(option.screenPoint.y)}); ${validName} = true;`
  }
  if (option.source === 'pose') {
    return `
      int ${pointName}Index = u_poseMap[${personIndex}];
      if (${pointName}Index >= 0) {
        vec4 ${pointName}Landmark = poseLandmark(${pointName}Index, ${option.index ?? 0});
        ${pointName} = ${pointName}Landmark.xy;
        ${validName} = ${pointName}Landmark.w >= 0.35;
      }`
  }
  if (option.source === 'face') {
    return `
      int ${pointName}Index = u_faceMap[${personIndex}];
      if (${pointName}Index >= 0) {
        ${pointName} = faceLandmark(${pointName}Index, ${option.index ?? 0}).xy;
        ${validName} = true;
      }`
  }
  const mapName = option.side === 'left' ? 'u_leftHandMap' : 'u_rightHandMap'
  return `
    int ${pointName}Index = ${mapName}[${personIndex}];
    if (${pointName}Index >= 0) {
      ${pointName} = handLandmark(${pointName}Index, ${option.index ?? 0}).xy;
      ${validName} = true;
    }`
}

function connectionBlock(
  optionA: LandmarkOption,
  optionB: LandmarkOption,
  color: string,
  personIndex: number,
  connectionIndex: number,
): string {
  const [r, g, b] = hexToRgb(color)
  const suffix = `${connectionIndex}_${personIndex}`
  return `
  {
    vec2 pointA_${suffix} = vec2(0.0);
    vec2 pointB_${suffix} = vec2(0.0);
    bool validA_${suffix} = false;
    bool validB_${suffix} = false;
    ${endpointCode(optionA, personIndex, `pointA_${suffix}`, `validA_${suffix}`)}
    ${endpointCode(optionB, personIndex, `pointB_${suffix}`, `validB_${suffix}`)}
    if (validA_${suffix} && validB_${suffix}) {
      float glow_${suffix} = renderGlowingSegmentExpWidth(
        v_uv,
        pointA_${suffix},
        pointB_${suffix},
        40.0,
        1.25
      );
      lineIntensity += glow_${suffix};
      lineColor += glow_${suffix} * vec3(${float(r)}, ${float(g)}, ${float(b)});
    }
  }`
}

export function generateShader(config: AppConfig): {
  source: string
  sources: Set<LandmarkSource>
} {
  const connections = config.connections.flatMap((connection) => {
    if (!connection.enabled || !connection.pointA || !connection.pointB || connection.pointA === connection.pointB) return []
    const pointA = LANDMARK_BY_ID.get(connection.pointA)
    const pointB = LANDMARK_BY_ID.get(connection.pointB)
    return pointA && pointB ? [{ connection, pointA, pointB }] : []
  })
  const sources = pluginSourcesForConnections(
    connections.flatMap(({ connection }) => [connection.pointA, connection.pointB]),
  )
  const uniforms = [
    sources.has('pose') ? `uniform int u_poseMap[${config.maxPeople}];` : '',
    sources.has('face') ? `uniform int u_faceMap[${config.maxPeople}];` : '',
    sources.has('hand') ? `uniform int u_leftHandMap[${config.maxPeople}];\nuniform int u_rightHandMap[${config.maxPeople}];` : '',
  ].filter(Boolean).join('\n')

  const blocks = connections.flatMap(({ pointA, pointB, connection }, connectionIndex) => {
    const bothScreen = pointA.source === 'screen' && pointB.source === 'screen'
    const people = bothScreen ? [0] : Array.from({ length: config.maxPeople }, (_, index) => index)
    return people.map((personIndex) =>
      connectionBlock(pointA, pointB, connection.color, personIndex, connectionIndex),
    )
  }).join('\n')

  return {
    sources,
    source: `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_webcam;
${uniforms}

float falloffEase(float x) {
  float t = clamp(1.0 - x, 0.0, 1.0);
  t *= t;
  t *= t;
  t *= t;
  return t;
}

float renderGlowingSegmentExpWidth(
  vec2 uv,
  vec2 p0,
  vec2 p1,
  float endpointRadiusPx,
  float sharpnessPx
) {
  float pxPerUv = u_resolution.y;
  sharpnessPx *= 0.01;
  float endpointRadiusUv = endpointRadiusPx / pxPerUv;
  float minThicknessUv = 2.0 / pxPerUv;
  vec2 segment = p1 - p0;
  float segmentLengthSq = max(dot(segment, segment), 0.0000001);
  float segmentLength = sqrt(segmentLengthSq);
  float projected = clamp(dot(uv - p0, segment) / segmentLengthSq, 0.0, 1.0);
  float segmentLengthPx = segmentLength * pxPerUv;
  float xPx = projected * segmentLengthPx;
  float denom = 1.0 + exp(-segmentLengthPx * sharpnessPx);
  float thicknessPx = endpointRadiusPx * (
    exp(-xPx * sharpnessPx) + exp((xPx - segmentLengthPx) * sharpnessPx)
  ) / denom;
  float thicknessUv = max(minThicknessUv, thicknessPx / pxPerUv);
  vec2 closestPoint = p0 + segment * projected;
  float lineNorm = length(uv - closestPoint) / thicknessUv;
  float endpointNorm0 = length(uv - p0) / endpointRadiusUv;
  float endpointNorm1 = length(uv - p1) / endpointRadiusUv;
  float dNorm = min(lineNorm, min(endpointNorm0, endpointNorm1));
  return falloffEase(dNorm * 0.6) + 0.4 * falloffEase(dNorm);
}

void main() {
  vec2 webcamUv = fitCover(vec2(1.0 - v_uv.x, v_uv.y), vec2(textureSize(u_webcam, 0)));
  vec3 webcamColor = texture(u_webcam, webcamUv).rgb;
  vec3 lineColor = vec3(0.0);
  float lineIntensity = 0.0;
  ${blocks}
  lineColor += lineColor * lineColor * 0.3;
  lineColor = lineColor / (1.0 + lineColor);
  lineColor = pow(lineColor, vec3(0.4545));
  outColor = vec4(
    mix(webcamColor + lineColor, lineColor, clamp(lineIntensity, 0.0, 1.0)),
    1.0
  );
}`,
  }
}

function mapAssignments(
  shader: ShaderPad,
  sources: Set<LandmarkSource>,
  assignments: PersonAssignment[],
): void {
  const updates: Record<string, number[]> = {}
  if (sources.has('pose')) updates.u_poseMap = assignments.map((assignment) => assignment.poseIndex)
  if (sources.has('face')) updates.u_faceMap = assignments.map((assignment) => assignment.faceIndex)
  if (sources.has('hand')) {
    updates.u_leftHandMap = assignments.map((assignment) => assignment.leftHandIndex)
    updates.u_rightHandMap = assignments.map((assignment) => assignment.rightHandIndex)
  }
  if (Object.keys(updates).length) shader.updateUniforms(updates)
}

export function createShaderRuntime(options: ShaderRuntimeOptions): ShaderRuntime {
  const { source, sources } = generateShader(options.config)
  const plugins: Plugin[] = [autosize(), helpers()]
  if (sources.has('face')) {
    plugins.push(face({ textureName: 'u_webcam', options: { maxFaces: options.config.maxPeople } }))
  }
  if (sources.has('pose')) {
    plugins.push(pose({ textureName: 'u_webcam', options: { maxPoses: options.config.maxPeople } }))
  }
  if (sources.has('hand')) {
    plugins.push(hands({ textureName: 'u_webcam', options: { maxHands: options.config.maxPeople * 2 } }))
  }

  const shader = new ShaderPad(source, { canvas: options.canvas, plugins })
  const snapshots: VisionSnapshots = { poses: [], faces: [], hands: [], handedness: [] }
  const tracker = new PersonTracker(options.config.maxPeople)
  const angleStates = new Map<string, number>()
  const angleLastSeen = new Map<string, number>()
  let destroyed = false

  const onFaceResult = (result: FaceLandmarkerResult | null) => {
    snapshots.faces = result?.faceLandmarks ?? []
  }
  const onPoseResult = (result: PoseLandmarkerResult | null) => {
    snapshots.poses = result?.landmarks ?? []
  }
  const onHandsResult = (result: HandLandmarkerResult | null) => {
    snapshots.hands = result?.landmarks ?? []
    snapshots.handedness = (result?.handedness ?? []).map((categories) => {
      const name = categories[0]?.categoryName?.toLowerCase()
      return name === 'left' || name === 'right' ? name : null
    })
  }
  shader.on('face:result', onFaceResult)
  shader.on('pose:result', onPoseResult)
  shader.on('hands:result', onHandsResult)

  const emptyMap = Array.from({ length: options.config.maxPeople }, () => -1)
  if (sources.has('pose')) shader.initializeUniform('u_poseMap', 'int', emptyMap, { arrayLength: options.config.maxPeople })
  if (sources.has('face')) shader.initializeUniform('u_faceMap', 'int', emptyMap, { arrayLength: options.config.maxPeople })
  if (sources.has('hand')) {
    shader.initializeUniform('u_leftHandMap', 'int', emptyMap, { arrayLength: options.config.maxPeople })
    shader.initializeUniform('u_rightHandMap', 'int', emptyMap, { arrayLength: options.config.maxPeople })
  }
  shader.initializeTexture('u_webcam', options.video)
  options.onStatus?.(sources.size > 1 || !sources.has('screen') ? 'Loading trackers' : 'Camera ready')

  shader.play(() => {
    if (destroyed) return
    shader.updateTextures({ u_webcam: options.video })
    const now = performance.now()
    let assignments = tracker.update(snapshots, now)
    const hasVision = sources.has('pose') || sources.has('face') || sources.has('hand')
    if (!hasVision && assignments[0]) assignments[0] = { ...assignments[0], active: true, anchor: { x: 0.5, y: 0.5 } }
    mapAssignments(shader, sources, assignments)

    const samples: MeasurementSample[] = []
    for (const connection of options.getConfig().connections) {
      if (!connection.enabled || !connection.pointA || !connection.pointB || connection.pointA === connection.pointB) continue
      const pointAOption = LANDMARK_BY_ID.get(connection.pointA)
      const pointBOption = LANDMARK_BY_ID.get(connection.pointB)
      if (!pointAOption || !pointBOption) continue
      const bothScreen = pointAOption.source === 'screen' && pointBOption.source === 'screen'
      const people = bothScreen ? assignments.slice(0, 1) : assignments
      for (const assignment of people) {
        if (!assignment.active) continue
        const pointA = resolveLandmark(pointAOption, assignment, snapshots)
        const pointB = resolveLandmark(pointBOption, assignment, snapshots)
        const angleKey = `${connection.id}:${assignment.slot}`
        if (!pointA || !pointB) {
          const seenAt = angleLastSeen.get(angleKey)
          if (seenAt !== undefined && now - seenAt > 1000) {
            angleStates.delete(angleKey)
            angleLastSeen.delete(angleKey)
          }
          continue
        }
        const measured = measurePoints(
          pointA,
          pointB,
          connection.measurement,
          connection.angleMode,
          angleStates.get(angleKey),
        )
        if (!measured) continue
        if (measured.angleState !== undefined) {
          angleStates.set(angleKey, measured.angleState)
          angleLastSeen.set(angleKey, now)
        }
        const midiValue = mapMeasurementToMidi(
          measured.value,
          connection.inputMin,
          connection.inputMax,
          connection.midiMin,
          connection.midiMax,
        )
        samples.push({
          connectionId: connection.id,
          personIndex: assignment.slot,
          rawValue: measured.value,
          midiValue,
        })
      }
    }
    options.onMeasurements(samples)
    options.onStatus?.('Tracking live')
  })

  return {
    destroy() {
      destroyed = true
      shader.off('face:result', onFaceResult)
      shader.off('pose:result', onPoseResult)
      shader.off('hands:result', onHandsResult)
      shader.destroy()
    },
  }
}

import type { FaceLandmarkerResult, HandLandmarkerResult, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import ShaderPad, { type Plugin } from 'shaderpad';
import autosize from 'shaderpad/plugins/autosize';
import face from 'shaderpad/plugins/face';
import hands from 'shaderpad/plugins/hands';
import helpers from 'shaderpad/plugins/helpers';
import pose from 'shaderpad/plugins/pose';
import { LANDMARK_BY_ID, pluginSourcesForConnections } from './landmarks';
import { mapMeasurementToMidi, measurePoints } from './measurements';
import { PersonTracker, resolveLandmark } from './person-tracker';
import type {
	AppConfig,
	LandmarkOption,
	LandmarkSource,
	MeasurementSample,
	PersonAssignment,
	VisionSnapshots,
} from './types';

interface ShaderRuntimeOptions {
	canvas: HTMLCanvasElement;
	video: HTMLVideoElement;
	config: AppConfig;
	getConfig: () => AppConfig;
	onMeasurements: (samples: MeasurementSample[]) => void;
	onStatus?: (status: string) => void;
}

export interface ShaderRuntime {
	destroy: () => void;
}

interface ShaderUniformUsage {
	pose: boolean;
	face: boolean;
	leftHand: boolean;
	rightHand: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
	const value = hex.replace('#', '');
	const parsed = Number.parseInt(
		value.length === 3
			? value
					.split('')
					.map(char => char + char)
					.join('')
			: value,
		16,
	);
	return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255];
}

function float(value: number): string {
	return Number.isInteger(value) ? `${value}.0` : value.toFixed(6);
}

function endpointCode(option: LandmarkOption, personIndex: number, pointName: string, validName: string): string {
	if (option.source === 'screen' && option.screenPoint) {
		return `${pointName} = vec2(${float(option.screenPoint.x)}, ${float(option.screenPoint.y)}); ${validName} = true;`;
	}
	if (option.source === 'pose') {
		return `
      int ${pointName}Index = u_poseMap[${personIndex}];
      if (${pointName}Index >= 0) {
        vec4 ${pointName}Landmark = poseLandmark(${pointName}Index, ${option.index ?? 0});
        ${pointName} = landmarkToViewport(${pointName}Landmark.xy);
        ${validName} = ${pointName}Landmark.w >= 0.35;
      }`;
	}
	if (option.source === 'face') {
		return `
      int ${pointName}Index = u_faceMap[${personIndex}];
      if (${pointName}Index >= 0) {
        vec2 ${pointName}Landmark = faceLandmark(${pointName}Index, ${option.index ?? 0}).xy;
        ${pointName} = landmarkToViewport(${pointName}Landmark);
        ${validName} = true;
      }`;
	}
	const mapName = option.side === 'left' ? 'u_leftHandMap' : 'u_rightHandMap';
	return `
    int ${pointName}Index = ${mapName}[${personIndex}];
    if (${pointName}Index >= 0) {
      vec2 ${pointName}Landmark = handLandmark(${pointName}Index, ${option.index ?? 0}).xy;
      ${pointName} = landmarkToViewport(${pointName}Landmark);
      ${validName} = true;
    }`;
}

function connectionBlock(
	optionA: LandmarkOption,
	optionB: LandmarkOption,
	color: string,
	personIndex: number,
	connectionIndex: number,
): string {
	const isRainbow = color === 'rainbow';
	const [r, g, b] = isRainbow ? [0, 0, 0] : hexToRgb(color);
	const suffix = `${connectionIndex}_${personIndex}`;
	return `
  {
    vec2 pointA_${suffix} = vec2(0.0);
    vec2 pointB_${suffix} = vec2(0.0);
    bool validA_${suffix} = false;
    bool validB_${suffix} = false;
    ${endpointCode(optionA, personIndex, `pointA_${suffix}`, `validA_${suffix}`)}
    ${endpointCode(optionB, personIndex, `pointB_${suffix}`, `validB_${suffix}`)}
    if (validA_${suffix} && validB_${suffix}) {
      vec3 elasticMask_${suffix} = renderGlowingSegmentExpWidth(
        v_uv,
        pointA_${suffix},
        pointB_${suffix},
        76.0,
        1.0
      );
      vec2 colorSegment_${suffix} = pointB_${suffix} - pointA_${suffix};
      float colorPosition_${suffix} = clamp(
        dot(v_uv - pointA_${suffix}, colorSegment_${suffix}) /
          max(dot(colorSegment_${suffix}, colorSegment_${suffix}), 0.0000001),
        0.0,
        1.0
      );
      vec3 elasticColor_${suffix} = elasticGradient(
        vec3(${float(r)}, ${float(g)}, ${float(b)}),
        ${isRainbow ? '1.0' : '0.0'},
        colorPosition_${suffix}
      );
      sceneColor = compositeElasticStrand(
        sceneColor,
        elasticColor_${suffix},
        elasticMask_${suffix}
      );
    }
  }`;
}

export function generateShader(config: AppConfig): {
	source: string;
	sources: Set<LandmarkSource>;
	uniforms: ShaderUniformUsage;
} {
	const connections = config.connections.flatMap(connection => {
		if (!connection.enabled || !connection.pointA || !connection.pointB || connection.pointA === connection.pointB)
			return [];
		const pointA = LANDMARK_BY_ID.get(connection.pointA);
		const pointB = LANDMARK_BY_ID.get(connection.pointB);
		return pointA && pointB ? [{ connection, pointA, pointB }] : [];
	});
	const sources = pluginSourcesForConnections(
		connections.flatMap(({ connection }) => [connection.pointA, connection.pointB]),
	);
	const drawnConnections = connections.filter(({ connection }) => connection.color !== 'transparent');
	const drawnEndpoints = drawnConnections.flatMap(({ pointA, pointB }) => [pointA, pointB]);
	const uniformUsage: ShaderUniformUsage = {
		pose: drawnEndpoints.some(point => point.source === 'pose'),
		face: drawnEndpoints.some(point => point.source === 'face'),
		leftHand: drawnEndpoints.some(point => point.source === 'hand' && point.side === 'left'),
		rightHand: drawnEndpoints.some(point => point.source === 'hand' && point.side === 'right'),
	};
	const uniformDeclarations = [
		'uniform float u_time;',
		uniformUsage.pose ? `uniform int u_poseMap[${config.maxPeople}];` : '',
		uniformUsage.face ? `uniform int u_faceMap[${config.maxPeople}];` : '',
		uniformUsage.leftHand ? `uniform int u_leftHandMap[${config.maxPeople}];` : '',
		uniformUsage.rightHand ? `uniform int u_rightHandMap[${config.maxPeople}];` : '',
	]
		.filter(Boolean)
		.join('\n');

	const blocks = drawnConnections
		.flatMap(({ pointA, pointB, connection }, connectionIndex) => {
			const bothScreen = pointA.source === 'screen' && pointB.source === 'screen';
			const people = bothScreen ? [0] : Array.from({ length: config.maxPeople }, (_, index) => index);
			return people.map(personIndex =>
				connectionBlock(pointA, pointB, connection.color, personIndex, connectionIndex),
			);
		})
		.join('\n');

	return {
		sources,
		uniforms: uniformUsage,
		source: `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_webcam;
${uniformDeclarations}

float falloffEase(float x) {
  float t = clamp(1.0 - x, 0.0, 1.0);
  t *= t;
  t *= t;
  t *= t;
  return t;
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 0.666667, 0.333333)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

vec3 srgbToLinear(vec3 color) {
  vec3 low = color / 12.92;
  vec3 high = pow((color + 0.055) / 1.055, vec3(2.4));
  return mix(low, high, step(vec3(0.04045), color));
}

vec3 linearToSrgb(vec3 color) {
  vec3 safeColor = max(color, vec3(0.0));
  vec3 low = safeColor * 12.92;
  vec3 high = 1.055 * pow(safeColor, vec3(0.416667)) - 0.055;
  return mix(low, high, step(vec3(0.003131), safeColor));
}

vec3 linearSrgbToOklab(vec3 color) {
  vec3 lms = mat3(
    0.412221, 0.211903, 0.088302,
    0.536333, 0.680700, 0.281719,
    0.051446, 0.107397, 0.629979
  ) * color;
  vec3 rootLms = pow(max(lms, vec3(0.0)), vec3(0.333333));
  return mat3(
    0.210454, 1.977998, 0.025904,
    0.793618, -2.428592, 0.782772,
    -0.004072, 0.450594, -0.808676
  ) * rootLms;
}

vec3 oklabToLinearSrgb(vec3 color) {
  vec3 rootLms = mat3(
    1.0, 1.0, 1.0,
    0.396338, -0.105561, -0.089484,
    0.215804, -0.063854, -1.291486
  ) * color;
  vec3 lms = rootLms * rootLms * rootLms;
  return mat3(
    4.076742, -1.268438, -0.004196,
    -3.307712, 2.609757, -0.703419,
    0.230970, -0.341319, 1.707615
  ) * lms;
}

vec3 modulateOklabLightness(vec3 color, float wave) {
  vec3 oklab = linearSrgbToOklab(srgbToLinear(color));
  oklab.x = clamp(oklab.x + mix(-0.12, 0.14, wave), 0.02, 0.98);
  return clamp(linearToSrgb(oklabToLinearSrgb(oklab)), 0.0, 1.0);
}

vec3 boostSaturation(vec3 color, float amount) {
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return clamp(mix(vec3(luminance), color, amount), 0.0, 1.0);
}

vec3 elasticGradient(vec3 baseColor, float rainbowMix, float position) {
  float leadingPosition = 1.0 - position;
  float brightnessPhase = u_time * 0.75 + leadingPosition * 0.25;
  float brightnessWave = 0.5 + 0.5 * sin(6.283185 * brightnessPhase);
  float rainbowHue = fract(u_time * 0.055 + leadingPosition * 0.125);
  vec3 rainbowColor = hsv2rgb(vec3(rainbowHue, 0.94, 1.0));
  vec3 gradientColor = mix(baseColor, rainbowColor, rainbowMix);
  return modulateOklabLightness(gradientColor, brightnessWave);
}

vec2 landmarkToViewport(vec2 landmark) {
  vec2 mirroredLandmark = vec2(1.0 - landmark.x, landmark.y);
  return fitCoverInverse(mirroredLandmark, vec2(textureSize(u_webcam, 0)));
}

vec3 renderGlowingSegmentExpWidth(
  vec2 uv,
  vec2 p0,
  vec2 p1,
  float endpointRadiusPx,
  float sharpnessPx
) {
  float pxPerUv = u_resolution.y;
  sharpnessPx *= 0.01;
  float endpointRadiusUv = endpointRadiusPx / pxPerUv;
  float minThicknessUv = 6.0 / pxPerUv;
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
  float core = falloffEase(dNorm * 0.78) + 0.35 * falloffEase(dNorm * 1.35);
  float innerGlow = max(falloffEase(dNorm * 0.24) - core * 0.32, 0.0);
  float outerGlow = max(falloffEase(dNorm * 0.12) - core * 0.55 - innerGlow * 0.4, 0.0);
  return vec3(core, innerGlow, outerGlow);
}

vec3 compositeElasticStrand(vec3 backdrop, vec3 strandColor, vec3 mask) {
  vec3 outerGlowColor = boostSaturation(clamp(strandColor * 1.12, 0.0, 1.0), 1.32);
  backdrop = mix(backdrop, outerGlowColor, mask.z * 0.14);
  vec3 innerGlowColor = boostSaturation(clamp(strandColor * 1.32, 0.0, 1.0), 1.22);
  backdrop = mix(backdrop, innerGlowColor, mask.y * 0.52);
  float coreCoverage = pow(clamp(mask.x, 0.0, 1.0), 0.56);
  return mix(backdrop, strandColor, coreCoverage);
}

void main() {
  vec2 webcamUv = fitCover(vec2(1.0 - v_uv.x, v_uv.y), vec2(textureSize(u_webcam, 0)));
  vec3 webcamColor = texture(u_webcam, webcamUv).rgb;
  vec3 sceneColor = webcamColor;
  ${blocks}
  outColor = vec4(sceneColor, 1.0);
}`,
	};
}

function mapAssignments(shader: ShaderPad, uniforms: ShaderUniformUsage, assignments: PersonAssignment[]): void {
	const updates: Record<string, number[]> = {};
	if (uniforms.pose) updates.u_poseMap = assignments.map(assignment => assignment.poseIndex);
	if (uniforms.face) updates.u_faceMap = assignments.map(assignment => assignment.faceIndex);
	if (uniforms.leftHand) updates.u_leftHandMap = assignments.map(assignment => assignment.leftHandIndex);
	if (uniforms.rightHand) updates.u_rightHandMap = assignments.map(assignment => assignment.rightHandIndex);
	if (Object.keys(updates).length) shader.updateUniforms(updates);
}

export function createShaderRuntime(options: ShaderRuntimeOptions): ShaderRuntime {
	const { source, sources, uniforms } = generateShader(options.config);
	const plugins: Plugin[] = [autosize(), helpers()];
	if (sources.has('face')) {
		plugins.push(face({ textureName: 'u_webcam', options: { maxFaces: options.config.maxPeople } }));
	}
	if (sources.has('pose')) {
		plugins.push(pose({ textureName: 'u_webcam', options: { maxPoses: options.config.maxPeople } }));
	}
	if (sources.has('hand')) {
		plugins.push(hands({ textureName: 'u_webcam', options: { maxHands: options.config.maxPeople * 2 } }));
	}

	const shader = new ShaderPad(source, { canvas: options.canvas, plugins });
	const snapshots: VisionSnapshots = { poses: [], faces: [], hands: [], handedness: [] };
	const tracker = new PersonTracker(options.config.maxPeople);
	const angleStates = new Map<string, number>();
	const angleLastSeen = new Map<string, number>();
	let destroyed = false;

	const onFaceResult = (result: FaceLandmarkerResult | null) => {
		snapshots.faces = result?.faceLandmarks ?? [];
	};
	const onPoseResult = (result: PoseLandmarkerResult | null) => {
		snapshots.poses = result?.landmarks ?? [];
	};
	const onHandsResult = (result: HandLandmarkerResult | null) => {
		snapshots.hands = result?.landmarks ?? [];
		snapshots.handedness = (result?.handedness ?? []).map(categories => {
			const name = categories[0]?.categoryName?.toLowerCase();
			return name === 'left' || name === 'right' ? name : null;
		});
	};
	shader.on('face:result', onFaceResult);
	shader.on('pose:result', onPoseResult);
	shader.on('hands:result', onHandsResult);

	const emptyMap = Array.from({ length: options.config.maxPeople }, () => -1);
	if (uniforms.pose)
		shader.initializeUniform('u_poseMap', 'int', emptyMap, { arrayLength: options.config.maxPeople });
	if (uniforms.face)
		shader.initializeUniform('u_faceMap', 'int', emptyMap, { arrayLength: options.config.maxPeople });
	if (uniforms.leftHand)
		shader.initializeUniform('u_leftHandMap', 'int', emptyMap, { arrayLength: options.config.maxPeople });
	if (uniforms.rightHand)
		shader.initializeUniform('u_rightHandMap', 'int', emptyMap, { arrayLength: options.config.maxPeople });
	shader.initializeTexture('u_webcam', options.video);
	options.onStatus?.(sources.size > 1 || !sources.has('screen') ? 'Loading trackers' : 'Camera ready');

	shader.play(() => {
		if (destroyed) return;
		shader.updateTextures({ u_webcam: options.video });
		const now = performance.now();
		let assignments = tracker.update(snapshots, now);
		const hasVision = sources.has('pose') || sources.has('face') || sources.has('hand');
		if (!hasVision && assignments[0])
			assignments[0] = { ...assignments[0], active: true, anchor: { x: 0.5, y: 0.5 } };
		mapAssignments(shader, uniforms, assignments);

		const samples: MeasurementSample[] = [];
		for (const connection of options.getConfig().connections) {
			if (
				!connection.enabled ||
				!connection.pointA ||
				!connection.pointB ||
				connection.pointA === connection.pointB
			)
				continue;
			const pointAOption = LANDMARK_BY_ID.get(connection.pointA);
			const pointBOption = LANDMARK_BY_ID.get(connection.pointB);
			if (!pointAOption || !pointBOption) continue;
			const bothScreen = pointAOption.source === 'screen' && pointBOption.source === 'screen';
			const people = bothScreen ? assignments.slice(0, 1) : assignments;
			for (const assignment of people) {
				if (!assignment.active) continue;
				const pointA = resolveLandmark(pointAOption, assignment, snapshots);
				const pointB = resolveLandmark(pointBOption, assignment, snapshots);
				const angleKey = `${connection.id}:${assignment.slot}`;
				if (!pointA || !pointB) {
					const seenAt = angleLastSeen.get(angleKey);
					if (seenAt !== undefined && now - seenAt > 1000) {
						angleStates.delete(angleKey);
						angleLastSeen.delete(angleKey);
					}
					continue;
				}
				const measured = measurePoints(pointA, pointB, connection.measurement, angleStates.get(angleKey));
				if (!measured) continue;
				if (measured.angleState !== undefined) {
					angleStates.set(angleKey, measured.angleState);
					angleLastSeen.set(angleKey, now);
				}
				const midiValue = mapMeasurementToMidi(
					measured.value,
					connection.inputMin,
					connection.inputMax,
					connection.midiMin,
					connection.midiMax,
				);
				samples.push({
					connectionId: connection.id,
					personIndex: assignment.slot,
					rawValue: measured.value,
					midiValue,
				});
			}
		}
		options.onMeasurements(samples);
		options.onStatus?.('Tracking live');
	});

	return {
		destroy() {
			destroyed = true;
			shader.off('face:result', onFaceResult);
			shader.off('pose:result', onPoseResult);
			shader.off('hands:result', onHandsResult);
			shader.destroy();
		},
	};
}

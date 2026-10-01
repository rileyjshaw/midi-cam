import { describe, expect, it } from 'vitest';
import { createConnection, createDefaultConfig, shaderSignature } from './config';
import { generateShader } from './shader-runtime';

describe('generated ShaderPad program', () => {
	it('hardcodes configured landmarks and includes only required point helpers', () => {
		const config = createDefaultConfig();
		const connection = createConnection([]);
		connection.pointA = 'pose:11';
		connection.pointB = 'pose:12';
		connection.color = '#FF4D6D';
		config.maxPeople = 2;
		config.connections = [connection];

		const generated = generateShader(config);
		expect([...generated.sources]).toEqual(['pose']);
		expect(generated.source).toContain('poseLandmark(pointA_0_0Index, 11)');
		expect(generated.source).toContain('poseLandmark(pointB_0_0Index, 12)');
		expect(generated.source).toContain('landmarkToViewport(pointA_0_0Landmark.xy)');
		expect(generated.source).toContain('vec2 mirroredLandmark = vec2(1.0 - landmark.x, landmark.y);');
		expect(generated.source).toContain('return fitCoverInverse(mirroredLandmark, vec2(textureSize(u_webcam, 0)));');
		expect(generated.source).toContain('u_poseMap[1]');
		expect(generated.source).not.toContain('faceLandmark(');
		expect(generated.source).not.toContain('handLandmark(');
		expect(generated.source).toContain('vec3(0.678523, 0.206081, 0.054138)');
	});

	it('selects hand and face plugins when a cross-category control needs them', () => {
		const config = createDefaultConfig();
		const connection = createConnection([]);
		connection.pointA = 'hand:right:4';
		connection.pointB = 'face:4';
		config.connections = [connection];

		const generated = generateShader(config);
		expect(generated.sources.has('hand')).toBe(true);
		expect(generated.sources.has('face')).toBe(true);
		expect(generated.sources.has('pose')).toBe(false);
		expect(generated.source).toContain('u_rightHandMap');
		expect(generated.source).toContain('u_faceMap');
		expect(generated.source).toContain('landmarkToViewport(pointA_0_0Landmark)');
		expect(generated.source).toContain('landmarkToViewport(pointB_0_0Landmark)');
	});

	it('declares only the hand map used by a hand-to-screen connection', () => {
		const config = createDefaultConfig();
		const connection = createConnection([]);
		connection.pointA = 'hand:left:0';
		connection.pointB = 'screen:top-left';
		config.connections = [connection];

		const generated = generateShader(config);
		expect(generated.sources.has('hand')).toBe(true);
		expect(generated.uniforms.leftHand).toBe(true);
		expect(generated.uniforms.rightHand).toBe(false);
		expect(generated.source).toContain('uniform int u_leftHandMap[1]');
		expect(generated.source).not.toContain('u_rightHandMap');
		expect(generated.source).toContain('pointB_0_0 = vec2(0.0, 1.0); validB_0_0 = true;');
		expect(generated.source).not.toContain('landmarkToViewport(pointB_0_0');
	});

	it('keeps tracking plugins active without drawing transparent connections', () => {
		const config = createDefaultConfig();
		const connection = createConnection([]);
		connection.pointA = 'hand:left:4';
		connection.pointB = 'screen:center';
		connection.color = 'transparent';
		config.connections = [connection];

		const generated = generateShader(config);
		expect(generated.sources.has('hand')).toBe(true);
		expect(generated.uniforms.leftHand).toBe(false);
		expect(generated.source).not.toContain('pointA_0_0');
		expect(generated.source).not.toContain('u_leftHandMap');
	});

	it('generates a time-evolving point-to-point hue gradient led by point A for rainbow lines', () => {
		const config = createDefaultConfig();
		const connection = createConnection([]);
		connection.pointA = 'pose:11';
		connection.pointB = 'pose:12';
		connection.color = 'rainbow';
		config.connections = [connection];

		const generated = generateShader(config);
		expect(generated.source).toContain('uniform float u_time;');
		expect(generated.source).toContain('float leadingPosition = 1.0 - position;');
		expect(generated.source).toContain('float rainbowHue = fract(u_time * 0.055 + leadingPosition * 0.125);');
		expect(generated.source).toContain('float hueAngle = 6.283185 * fract(rainbowHue + 0.08);');
		expect(generated.source).toContain('float chroma = 0.20;');
		expect(generated.source).toContain('elasticRainbowOklab(\n          colorPosition_0_0,');
		expect(generated.source).not.toContain('hsv2rgb');
	});

	it('bakes fixed connection colors into the generated shader', () => {
		const config = createDefaultConfig();
		const connection = createConnection([]);
		connection.pointA = 'pose:11';
		connection.pointB = 'pose:12';
		connection.color = '#67E8F9';
		config.connections = [connection];

		const cyanShader = generateShader(config).source;
		connection.color = '#FF4D6D';
		const pinkShader = generateShader(config).source;

		expect(cyanShader).not.toBe(pinkShader);
	});

	it('does not rebuild for MIDI-only edits but does rebuild for shader edits', () => {
		const config = createDefaultConfig();
		const connection = createConnection([]);
		connection.pointA = 'hand:right:4';
		connection.pointB = 'hand:right:8';
		config.connections = [connection];
		const initial = shaderSignature(config);

		connection.cc = 74;
		connection.inputMin = 0.2;
		expect(shaderSignature(config)).toBe(initial);
		connection.color = '#22D3EE';
		expect(shaderSignature(config)).not.toBe(initial);
	});
	it('uses only the body model and derives face bounds from valid pose indices', () => {
		const config = createDefaultConfig();
		const connection = createConnection([]);
		connection.pointA = 'pose:39';
		connection.pointB = 'screen:center';
		config.connections = [connection];
		const generated = generateShader(config);
		expect([...generated.sources]).toEqual(['pose', 'screen']);
		expect(generated.source).toContain('poseLandmark(pointA_0_0Index, 0)');
		expect(generated.source).toContain('i < 11');
		expect(generated.source).toContain('pointA_0_0Landmark.w = min(pointA_0_0Landmark.w, landmark.w)');
		expect(generated.source).not.toContain('poseLandmark(pointA_0_0Index, 39)');
		expect(generated.source).not.toContain('faceLandmark(');
	});
});

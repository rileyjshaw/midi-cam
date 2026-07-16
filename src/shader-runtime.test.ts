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
		expect(generated.source).toContain('vec2(1.0 - pointA_0_0Landmark.x, pointA_0_0Landmark.y)');
		expect(generated.source).toContain('u_poseMap[1]');
		expect(generated.source).not.toContain('faceLandmark(');
		expect(generated.source).not.toContain('handLandmark(');
		expect(generated.source).toContain('vec3(1.0, 0.301961, 0.427451)');
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
		expect(generated.source).toContain('vec3(rainbowHue, 0.94, 1.0)');
		expect(generated.source).toContain('hsv2rgb');
	});

	it('modulates only color lightness with point A leading by a quarter wavelength', () => {
		const config = createDefaultConfig();
		const connection = createConnection([]);
		connection.pointA = 'pose:11';
		connection.pointB = 'pose:12';
		connection.color = '#22D3EE';
		config.connections = [connection];

		const generated = generateShader(config);
		expect(generated.source).toContain('float lightnessPhase = u_time * 0.34 + leadingPosition * 0.25;');
		expect(generated.source).toContain('float lightness = 0.82 + 0.18 * sin(6.283185 * lightnessPhase);');
		expect(generated.source).toContain('vec3 elasticColor_0_0 = elasticGradient(');
		expect(generated.source).toContain('vec3(0.133333, 0.827451, 0.933333),\n        0.0,');
		expect(generated.source).toContain('vec2 elasticMask_0_0 = renderGlowingSegmentExpWidth(');
		expect(generated.source).toContain('69.0,');
		expect(generated.source).toContain('boostSaturation(elasticColor_0_0, 1.42)');
		expect(generated.source).toContain('elasticMask_0_0.y * 0.14');
		expect(generated.source).not.toContain('lineIntensity += elasticColor_0_0');
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
});

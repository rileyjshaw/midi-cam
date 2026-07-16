import { describe, expect, it } from 'vitest'
import { createConnection, createDefaultConfig, shaderSignature } from './config'
import { generateShader } from './shader-runtime'

describe('generated ShaderPad program', () => {
  it('hardcodes configured landmarks and includes only required point helpers', () => {
    const config = createDefaultConfig()
    const connection = createConnection([])
    connection.pointA = 'pose:15'
    connection.pointB = 'pose:16'
    connection.color = '#FF4D6D'
    config.maxPeople = 2
    config.connections = [connection]

    const generated = generateShader(config)
    expect([...generated.sources]).toEqual(['pose'])
    expect(generated.source).toContain('poseLandmark(pointA_0_0Index, 15)')
    expect(generated.source).toContain('poseLandmark(pointB_0_0Index, 16)')
    expect(generated.source).toContain('vec2(1.0 - pointA_0_0Landmark.x, pointA_0_0Landmark.y)')
    expect(generated.source).toContain('u_poseMap[1]')
    expect(generated.source).not.toContain('faceLandmark(')
    expect(generated.source).not.toContain('handLandmark(')
    expect(generated.source).toContain('vec3(1.0, 0.301961, 0.427451)')
  })

  it('selects hand and face plugins when a cross-category control needs them', () => {
    const config = createDefaultConfig()
    const connection = createConnection([])
    connection.pointA = 'hand:right:4'
    connection.pointB = 'face:4'
    config.connections = [connection]

    const generated = generateShader(config)
    expect(generated.sources.has('hand')).toBe(true)
    expect(generated.sources.has('face')).toBe(true)
    expect(generated.sources.has('pose')).toBe(false)
    expect(generated.source).toContain('u_rightHandMap')
    expect(generated.source).toContain('u_faceMap')
  })

  it('declares only the hand map used by a hand-to-screen connection', () => {
    const config = createDefaultConfig()
    const connection = createConnection([])
    connection.pointA = 'hand:left:0'
    connection.pointB = 'screen:top-left'
    config.connections = [connection]

    const generated = generateShader(config)
    expect(generated.sources.has('hand')).toBe(true)
    expect(generated.uniforms.leftHand).toBe(true)
    expect(generated.uniforms.rightHand).toBe(false)
    expect(generated.source).toContain('uniform int u_leftHandMap[1]')
    expect(generated.source).not.toContain('u_rightHandMap')
  })

  it('keeps tracking plugins active without drawing transparent connections', () => {
    const config = createDefaultConfig()
    const connection = createConnection([])
    connection.pointA = 'hand:left:4'
    connection.pointB = 'screen:center'
    connection.color = 'transparent'
    config.connections = [connection]

    const generated = generateShader(config)
    expect(generated.sources.has('hand')).toBe(true)
    expect(generated.uniforms.leftHand).toBe(false)
    expect(generated.source).not.toContain('pointA_0_0')
    expect(generated.source).not.toContain('u_leftHandMap')
  })

  it('generates a time-evolving point-to-point hue gradient for rainbow lines', () => {
    const config = createDefaultConfig()
    const connection = createConnection([])
    connection.pointA = 'pose:15'
    connection.pointB = 'pose:16'
    connection.color = 'rainbow'
    config.connections = [connection]

    const generated = generateShader(config)
    expect(generated.source).toContain('uniform float u_time;')
    expect(generated.source).toContain('colorPosition_0_0 * 0.42')
    expect(generated.source).toContain('hsv2rgb')
  })

  it('does not rebuild for MIDI-only edits but does rebuild for shader edits', () => {
    const config = createDefaultConfig()
    const connection = createConnection([])
    connection.pointA = 'hand:right:4'
    connection.pointB = 'hand:right:8'
    config.connections = [connection]
    const initial = shaderSignature(config)

    connection.cc = 74
    connection.inputMin = 0.2
    expect(shaderSignature(config)).toBe(initial)
    connection.color = '#22D3EE'
    expect(shaderSignature(config)).not.toBe(initial)
  })
})

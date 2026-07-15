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

import { describe, expect, it, vi } from 'vitest'
import { createConnection, createDefaultConfig } from './config'
import { MidiRouter } from './midi'

describe('MIDI routing', () => {
  it('routes performers to ascending channels and deduplicates values', () => {
    const send = vi.fn()
    const output = { id: 'out', send } as unknown as MIDIOutput
    const config = createDefaultConfig()
    config.maxPeople = 4
    const connection = createConnection([])
    connection.cc = 22
    config.connections = [connection]
    const router = new MidiRouter()
    router.setOutput(output)
    const samples = [
      { connectionId: connection.id, personIndex: 0, rawValue: 0.5, midiValue: 64 },
      { connectionId: connection.id, personIndex: 2, rawValue: 0.5, midiValue: 64 },
    ]
    router.send(config, samples)
    router.send(config, samples)
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenNthCalledWith(1, [0xb0, 22, 64])
    expect(send).toHaveBeenNthCalledWith(2, [0xb2, 22, 64])
  })
})

import type { AppConfig, MeasurementSample } from './types';

export class MidiRouter {
	private output: MIDIOutput | null = null;
	private lastValues = new Map<string, number>();

	setOutput(output: MIDIOutput | null): void {
		if (output?.id !== this.output?.id) this.lastValues.clear();
		this.output = output;
	}

	send(config: AppConfig, samples: MeasurementSample[]): void {
		if (!this.output) return;
		const controls = new Map(config.connections.map(connection => [connection.id, connection]));
		for (const sample of samples) {
			const control = controls.get(sample.connectionId);
			if (
				!control?.enabled ||
				sample.midiValue === null ||
				sample.personIndex < 0 ||
				sample.personIndex >= config.maxPeople
			)
				continue;
			const channel = sample.personIndex;
			const key = `${channel}:${control.cc}`;
			if (this.lastValues.get(key) === sample.midiValue) continue;
			this.output.send([0xb0 | channel, control.cc, sample.midiValue]);
			this.lastValues.set(key, sample.midiValue);
		}
	}
}

export function midiOutputs(access: MIDIAccess | null): MIDIOutput[] {
	return access ? [...access.outputs.values()] : [];
}

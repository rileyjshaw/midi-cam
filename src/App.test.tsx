// @vitest-environment jsdom

import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createConnection, createDefaultConfig } from './config';
import { persistWorkingConfig } from './persistence';

vi.mock('./shader-runtime', () => ({
	createShaderRuntime: vi.fn(() => ({ destroy: vi.fn() })),
}));

const settle = () => new Promise<void>(resolve => window.setTimeout(resolve, 0));

describe('application interface', () => {
	let dispose: (() => void) | undefined;

	beforeEach(() => {
		vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
		localStorage.clear();
		const config = createDefaultConfig();
		config.connections = [createConnection([])];
		persistWorkingConfig(config);
	});

	afterEach(() => {
		dispose?.();
		dispose = undefined;
		document.body.replaceChildren();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('opens Edit on Escape when there is nothing else to close', async () => {
		dispose = render(() => <App />, document.body);
		expect(document.querySelector('.config-dialog')).toBeNull();

		document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();

		expect(document.querySelector('.config-dialog')).not.toBeNull();
	});

	it('closes the File menu without opening Edit', async () => {
		dispose = render(() => <App />, document.body);
		const fileButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
			button => button.textContent === 'File',
		);
		expect(fileButton).toBeDefined();

		fileButton?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
		await settle();
		expect(document.querySelector('.menu-content')).not.toBeNull();

		document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();

		expect(document.querySelector('.menu-content')).toBeNull();
		expect(document.querySelector('.config-dialog')).toBeNull();
	});

	it('combines quick start and credits in the About dialog', async () => {
		dispose = render(() => <App />, document.body);
		const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
		const aboutButton = buttons.find(button => button.textContent === 'About');

		expect(aboutButton).toBeDefined();
		expect(buttons.some(button => button.textContent === 'Help')).toBe(false);

		aboutButton?.click();
		await settle();

		const dialog = document.querySelector('.info-dialog');
		expect(dialog?.textContent).toContain('Quick start');
		expect(dialog?.textContent).toContain('Enable the camera and MIDI output.');
		expect(dialog?.querySelector('.setup-complete')).toBeNull();

		const credit = dialog?.querySelector<HTMLAnchorElement>('.about-credit a');
		expect(credit?.textContent).toBe('Misery & Company');
		expect(credit?.href).toBe('https://misery.co/');
		expect(credit?.target).toBe('_blank');
	});

	it('marks camera and MIDI setup complete once both are active', async () => {
		const output = { id: 'output-1', name: 'Test output', send: vi.fn() } as unknown as MIDIOutput;
		const camera = {
			deviceId: 'camera-1',
			groupId: 'group-1',
			kind: 'videoinput',
			label: 'Built-in camera',
			toJSON: () => ({}),
		} as MediaDeviceInfo;
		const track = {
			addEventListener: vi.fn(),
			getSettings: () => ({ deviceId: camera.deviceId }),
			stop: vi.fn(),
		} as unknown as MediaStreamTrack;
		const access = {
			outputs: new Map([[output.id, output]]),
			onstatechange: null,
		} as unknown as MIDIAccess;
		vi.stubGlobal('navigator', {
			mediaDevices: {
				enumerateDevices: vi.fn().mockResolvedValue([camera]),
				getUserMedia: vi.fn().mockResolvedValue({
					getTracks: () => [track],
					getVideoTracks: () => [track],
				}),
			},
			requestMIDIAccess: vi.fn().mockResolvedValue(access),
		});
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();

		dispose = render(() => <App />, document.body);
		const button = (label: string) =>
			[...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.includes(label));

		button('Enable MIDI')?.click();
		await settle();
		button('Start camera')?.click();
		await settle();
		button('About')?.click();
		await settle();

		const complete = document.querySelector('.setup-complete');
		expect(complete?.textContent).toContain('Complete');
		expect(complete?.querySelector('svg')).not.toBeNull();
		expect(document.querySelector('.about-quick-start li')?.classList).toContain('complete');
	});

	it('replaces the camera button with a webcam picker and switches devices', async () => {
		const cameras = ['Built-in camera', 'Studio camera'].map(
			(label, index) =>
				({
					deviceId: `camera-${index + 1}`,
					groupId: `group-${index + 1}`,
					kind: 'videoinput',
					label,
					toJSON: () => ({}),
				}) as MediaDeviceInfo,
		);
		const tracks = cameras.map(
			camera =>
				({
					addEventListener: vi.fn(),
					getSettings: () => ({ deviceId: camera.deviceId }),
					stop: vi.fn(),
				}) as unknown as MediaStreamTrack,
		);
		const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
			const requestedId = (constraints.video as MediaTrackConstraints).deviceId;
			const exactConstraint =
				typeof requestedId === 'object' && !Array.isArray(requestedId) ? requestedId.exact : requestedId;
			const exactId = Array.isArray(exactConstraint) ? exactConstraint[0] : exactConstraint;
			const index = cameras.findIndex(camera => camera.deviceId === exactId);
			const track = tracks[index >= 0 ? index : 0];
			return {
				getTracks: () => [track],
				getVideoTracks: () => [track],
			} as unknown as MediaStream;
		});
		vi.stubGlobal('navigator', {
			mediaDevices: {
				enumerateDevices: vi.fn().mockResolvedValue(cameras),
				getUserMedia,
			},
		});
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();

		dispose = render(() => <App />, document.body);
		const startButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button =>
			button.textContent?.includes('Start camera'),
		);
		startButton?.click();
		await settle();

		const picker = document.querySelector<HTMLSelectElement>('select[aria-label="Camera"]');
		expect(picker).not.toBeNull();
		expect([...picker!.options].map(option => option.textContent)).toEqual(['Built-in camera', 'Studio camera']);

		picker!.value = cameras[1].deviceId;
		picker!.dispatchEvent(new Event('change', { bubbles: true }));
		await settle();

		expect(getUserMedia).toHaveBeenCalledTimes(2);
		expect(getUserMedia.mock.calls[1]?.[0]).toMatchObject({
			video: { deviceId: { exact: cameras[1].deviceId } },
		});
		expect(picker!.value).toBe(cameras[1].deviceId);
		expect(tracks[0].stop).toHaveBeenCalledOnce();
	});
});

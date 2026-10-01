// @vitest-environment jsdom

import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createConnection, createDefaultConfig } from './config';
import { loadWorkingConfig, persistWorkingConfig, saveNamedConfig } from './persistence';

vi.mock('./shader-runtime', () => ({
	createShaderRuntime: vi.fn(() => ({ destroy: vi.fn() })),
}));

const settle = () => new Promise<void>(resolve => window.setTimeout(resolve, 0));
const findButton = (label: string) =>
	[...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes(label));
const openMenuFrom = (target: Element) =>
	target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
const chooseMenuItem = (label: string) => {
	const item = [...document.querySelectorAll<HTMLElement>('.menu-select-content .menu-item')].find(
		candidate => candidate.textContent?.trim() === label,
	);
	item?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }));
};
const pressEscape = () => {
	document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
};
const pressNewShortcut = () => {
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true, cancelable: true }));
};

function cameraDevice(deviceId: string, label: string): MediaDeviceInfo {
	return {
		deviceId,
		groupId: `group-${deviceId}`,
		kind: 'videoinput',
		label,
		toJSON: () => ({}),
	} as MediaDeviceInfo;
}

function cameraTrack(deviceId: string): MediaStreamTrack {
	return {
		addEventListener: vi.fn(),
		getSettings: () => ({ deviceId }),
		stop: vi.fn(),
	} as unknown as MediaStreamTrack;
}

function cameraStream(track: MediaStreamTrack): MediaStream {
	return {
		getTracks: () => [track],
		getVideoTracks: () => [track],
	} as unknown as MediaStream;
}

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

	it('keeps combobox suggestions accessible inside the Edit dialog', async () => {
		dispose = render(() => <App />, document.body);
		findButton('Edit')?.click();
		await settle();
		const input = document.querySelector<HTMLInputElement>('input[aria-label="Point A"]')!;
		input.focus();
		await settle();
		const picker = document.querySelector<HTMLElement>('.landmark-skeleton')!;
		expect(picker).not.toBeNull();
		expect(document.querySelector('[role="listbox"]')?.closest('[aria-hidden="true"]')).toBeNull();
		expect(getComputedStyle(input).pointerEvents).not.toBe('none');
		expect(getComputedStyle(document.querySelector('.config-dialog')!).pointerEvents).not.toBe('none');
		picker.querySelector<HTMLButtonElement>('[aria-label="Explore face"]')!.click();
		picker.querySelector<HTMLButtonElement>('[aria-label="Face settings"]')!.click();
		await settle();
		const toggle = picker.querySelector<HTMLInputElement>('[role="switch"]')!;
		toggle.focus();
		expect(document.activeElement).toBe(toggle);
		expect(toggle.closest('[aria-hidden="true"]')).toBeNull();
		toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		await settle();
		expect(document.querySelector('.landmark-settings')).toBeNull();
		expect(input.getAttribute('aria-expanded')).toBe('true');
		pressEscape();
		await settle();
		expect(input.getAttribute('aria-expanded')).toBe('false');
		expect(document.querySelector('.config-dialog')).not.toBeNull();
	});

	it('opens Edit on Escape when there is nothing else to close', async () => {
		dispose = render(() => <App />, document.body);
		expect(document.querySelector('.config-dialog')).toBeNull();

		pressEscape();
		await settle();

		expect(document.querySelector('.config-dialog')).not.toBeNull();
	});

	it('keeps the splash visible until both camera and MIDI are enabled', async () => {
		const config = createDefaultConfig();
		config.connections = [];
		persistWorkingConfig(config);
		const camera = cameraDevice('camera-1', 'Built-in camera');
		const access = {
			outputs: new Map(),
			onstatechange: null,
		} as unknown as MIDIAccess;
		vi.stubGlobal('navigator', {
			mediaDevices: {
				enumerateDevices: vi.fn().mockResolvedValue([camera]),
				getUserMedia: vi.fn().mockResolvedValue(cameraStream(cameraTrack(camera.deviceId))),
			},
			requestMIDIAccess: vi.fn().mockResolvedValue(access),
		});
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();

		dispose = render(() => <App />, document.body);
		expect(document.querySelector('.camera-empty')).not.toBeNull();
		expect(document.querySelector('.config-dialog')).toBeNull();

		findButton('Start camera')?.click();
		await settle();
		await settle();

		expect(document.querySelector('.camera-empty')).not.toBeNull();
		expect(document.querySelector('.camera-empty')?.classList.contains('has-camera')).toBe(true);
		expect(document.querySelector('.source-video')?.classList.contains('splash-preview')).toBe(true);
		expect(document.querySelector('.camera-empty-actions')?.textContent).not.toContain('Start camera');
		expect(document.querySelector('.camera-empty-actions')?.textContent).toContain('Enable MIDI');
		expect(document.querySelector('.config-dialog')).toBeNull();

		findButton('Enable MIDI')?.click();
		await settle();

		expect(document.querySelector('.camera-empty')).toBeNull();
		expect(document.querySelector('.source-video')?.classList.contains('splash-preview')).toBe(false);
		expect(document.querySelector('.config-dialog')).not.toBeNull();
	});

	it('closes the File menu without opening Edit', async () => {
		dispose = render(() => <App />, document.body);
		const fileButton = findButton('File');
		expect(fileButton).toBeDefined();

		fileButton?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
		await settle();
		expect(document.querySelector('.menu-content')).not.toBeNull();

		pressEscape();
		await settle();

		expect(document.querySelector('.menu-content')).toBeNull();
		expect(document.querySelector('.config-dialog')).toBeNull();
	});

	it('starts a new configuration without warning when no controls have both landmarks', async () => {
		const incomplete = createDefaultConfig();
		const connection = createConnection([]);
		connection.pointA = 'pose:11';
		incomplete.connections = [connection];
		incomplete.maxPeople = 4;
		incomplete.midiOutputId = 'output-1';
		persistWorkingConfig(incomplete);
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
		dispose = render(() => <App />, document.body);

		pressNewShortcut();
		await settle();

		expect(confirm).not.toHaveBeenCalled();
		expect(loadWorkingConfig().connections).toEqual([]);
	});

	it('warns about unsaved changes before starting a new configuration', async () => {
		const unsaved = createDefaultConfig();
		const connection = createConnection([]);
		connection.pointA = 'pose:11';
		connection.pointB = 'pose:12';
		unsaved.connections = [connection];
		persistWorkingConfig(unsaved);
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
		dispose = render(() => <App />, document.body);

		pressNewShortcut();
		await settle();

		expect(confirm).toHaveBeenCalledWith(
			'You have unsaved changes to the current configuration. Start a new configuration and discard them?',
		);
		expect(loadWorkingConfig().connections).toHaveLength(1);
	});

	it('does not warn immediately after loading a named configuration', async () => {
		const named = createDefaultConfig();
		const connection = createConnection([]);
		connection.pointA = 'pose:11';
		connection.pointB = 'pose:12';
		named.connections = [connection];
		saveNamedConfig('Stage setup', named);
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
		dispose = render(() => <App />, document.body);

		const fileButton = findButton('File');
		fileButton?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
		await settle();
		const loadItem = [...document.querySelectorAll<HTMLElement>('.menu-content .menu-item')].find(item =>
			item.textContent?.includes('Load'),
		);
		loadItem?.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }));
		await settle();
		document.querySelector<HTMLButtonElement>('.saved-config-main')?.click();
		await settle();

		pressNewShortcut();
		await settle();

		expect(confirm).not.toHaveBeenCalled();
		expect(loadWorkingConfig().connections).toEqual([]);
	});

	it('ignores incomplete controls when matching the current configuration to a named one', async () => {
		const current = createDefaultConfig();
		const complete = createConnection([]);
		complete.pointA = 'pose:11';
		complete.pointB = 'pose:12';
		current.connections = [complete];
		saveNamedConfig('Stage setup', current);
		const incomplete = createConnection(current.connections);
		incomplete.pointA = 'pose:13';
		current.connections.push(incomplete);
		persistWorkingConfig(current);
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
		dispose = render(() => <App />, document.body);

		pressNewShortcut();
		await settle();

		expect(confirm).not.toHaveBeenCalled();
		expect(loadWorkingConfig().connections).toEqual([]);
	});

	it('combines quick start and credits in the About dialog', async () => {
		dispose = render(() => <App />, document.body);
		const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
		const aboutButton = findButton('About');

		expect(aboutButton).toBeDefined();
		expect(buttons.some(button => button.textContent === 'Help')).toBe(false);

		aboutButton?.click();
		await settle();

		const dialog = document.querySelector('.info-dialog');
		expect(dialog?.textContent).toContain('Quick start');
		expect(dialog?.textContent).toContain('Enable the camera and MIDI output.');
		expect(dialog?.querySelector('.setup-complete')).toBeNull();
		const footerLines = [...(dialog?.querySelectorAll<HTMLParagraphElement>('.about-footer p') ?? [])];
		expect(footerLines.map(line => line.textContent?.trim())).toEqual([
			'Camera frames and landmark data stay in your browser.',
			'Built by Misery & Company',
		]);

		const credit = dialog?.querySelector<HTMLAnchorElement>('.about-credit a');
		expect(credit?.textContent).toBe('Misery & Company');
		expect(credit?.href).toBe('https://misery.co/');
		expect(credit?.target).toBe('_blank');
	});

	it('places camera controls before MIDI controls', () => {
		dispose = render(() => <App />, document.body);
		const controls = [...document.querySelectorAll<HTMLElement>('.menu-status > *')].map(item =>
			item.textContent?.trim(),
		);
		const landingActions = [...document.querySelectorAll<HTMLButtonElement>('.camera-empty-actions > button')].map(
			button => button.textContent?.trim(),
		);

		expect(controls.slice(0, 2)).toEqual(['Start camera', 'Enable MIDI']);
		expect(landingActions).toEqual(['Start camera', 'Enable MIDI']);
	});

	it('opens the measurement menu from its full trigger and resets the selected input range', async () => {
		dispose = render(() => <App />, document.body);
		findButton('Edit')?.click();
		await settle();

		const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Measurement type"]');
		expect(trigger).not.toBeNull();
		expect(document.querySelector('select[aria-label="Measurement type"]')).toBeNull();
		openMenuFrom(trigger!.querySelector('small')!);
		await settle();

		expect(
			[...document.querySelectorAll<HTMLElement>('.measurement-menu-content .menu-item')].map(item =>
				item.textContent?.trim(),
			),
		).toEqual(['Distance', 'Angle', 'Distance X', 'Distance Y']);
		chooseMenuItem('Angle');
		await settle();

		const connection = loadWorkingConfig().connections[0];
		expect(connection.measurement).toBe('angle');
		expect([connection.inputMin, connection.inputMax]).toEqual([-90, 90]);
		expect(trigger?.textContent).toContain('Angle');
	});

	it('opens the performers menu from its label and updates the performer count', async () => {
		dispose = render(() => <App />, document.body);
		findButton('Edit')?.click();
		await settle();

		const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Performers"]');
		expect(trigger).not.toBeNull();
		expect(document.querySelector('select[aria-label="Performers"]')).toBeNull();
		openMenuFrom(trigger!.querySelector('span')!);
		await settle();

		expect(
			[...document.querySelectorAll<HTMLElement>('.performers-menu-content .menu-item')].map(item =>
				item.textContent?.trim(),
			),
		).toEqual(['1', '2', '3', '4']);
		chooseMenuItem('3');
		await settle();

		expect(loadWorkingConfig().maxPeople).toBe(3);
		expect(trigger?.textContent).toContain('3');
	});

	it('closes an open dropdown before the edit dialog on Escape', async () => {
		dispose = render(() => <App />, document.body);
		findButton('Edit')?.click();
		await settle();
		const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Measurement type"]');
		openMenuFrom(trigger!);
		await settle();
		expect(document.querySelector('.measurement-menu-content')).not.toBeNull();

		pressEscape();
		await settle();

		expect(document.querySelector('.measurement-menu-content')).toBeNull();
		expect(document.querySelector('.config-dialog')).not.toBeNull();
	});

	it('marks camera and MIDI setup complete once both are active', async () => {
		const output = { id: 'output-1', name: 'Test output', send: vi.fn() } as unknown as MIDIOutput;
		const camera = cameraDevice('camera-1', 'Built-in camera');
		const track = cameraTrack(camera.deviceId);
		const access = {
			outputs: new Map([[output.id, output]]),
			onstatechange: null,
		} as unknown as MIDIAccess;
		vi.stubGlobal('navigator', {
			mediaDevices: {
				enumerateDevices: vi.fn().mockResolvedValue([camera]),
				getUserMedia: vi.fn().mockResolvedValue(cameraStream(track)),
			},
			requestMIDIAccess: vi.fn().mockResolvedValue(access),
		});
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();

		dispose = render(() => <App />, document.body);
		findButton('Enable MIDI')?.click();
		await settle();
		findButton('Start camera')?.click();
		await settle();
		findButton('About')?.click();
		await settle();

		const complete = document.querySelector('.setup-complete');
		expect(complete?.textContent).toContain('Complete');
		expect(complete?.querySelector('svg')).not.toBeNull();
		expect(document.querySelector('.about-quick-start li')?.classList).toContain('complete');
	});

	it('replaces the camera button with a webcam picker and switches devices', async () => {
		const cameras = [cameraDevice('camera-1', 'Built-in camera'), cameraDevice('camera-2', 'Studio camera')];
		const tracks = cameras.map(camera => cameraTrack(camera.deviceId));
		const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
			const requestedId = (constraints.video as MediaTrackConstraints).deviceId;
			const exactConstraint =
				typeof requestedId === 'object' && !Array.isArray(requestedId) ? requestedId.exact : requestedId;
			const exactId = Array.isArray(exactConstraint) ? exactConstraint[0] : exactConstraint;
			const index = cameras.findIndex(camera => camera.deviceId === exactId);
			const track = tracks[index >= 0 ? index : 0];
			return cameraStream(track);
		});
		vi.stubGlobal('navigator', {
			mediaDevices: {
				enumerateDevices: vi.fn().mockResolvedValue(cameras),
				getUserMedia,
			},
		});
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();

		dispose = render(() => <App />, document.body);
		findButton('Start camera')?.click();
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
		const updatedPicker = document.querySelector<HTMLSelectElement>('select[aria-label="Camera"]');
		expect(updatedPicker?.value).toBe(cameras[1].deviceId);
		expect(tracks[0].stop).toHaveBeenCalledOnce();
	});
});

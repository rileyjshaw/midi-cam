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

describe('application keyboard layers', () => {
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
		const access = {
			outputs: new Map([[output.id, output]]),
			onstatechange: null,
		} as unknown as MIDIAccess;
		vi.stubGlobal('navigator', {
			mediaDevices: {
				getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }),
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
});

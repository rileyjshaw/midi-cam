// @vitest-environment jsdom

import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createConnection, createDefaultConfig } from './config';
import { persistWorkingConfig } from './persistence';

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
});

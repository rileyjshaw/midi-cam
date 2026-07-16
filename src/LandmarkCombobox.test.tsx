// @vitest-environment jsdom

import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import { LandmarkCombobox } from './LandmarkCombobox';

const settle = () => new Promise<void>(resolve => window.queueMicrotask(() => window.queueMicrotask(resolve)));

describe('landmark combobox', () => {
	let dispose: (() => void) | undefined;

	afterEach(() => {
		dispose?.();
		dispose = undefined;
		document.body.replaceChildren();
	});

	it('clears the query on open and restores the selected label after choosing', async () => {
		const host = document.createElement('div');
		document.body.append(host);
		let currentValue = '';

		function Harness() {
			const [value, setValue] = createSignal<string | null>('face:473');
			return (
				<LandmarkCombobox
					value={value()}
					label="Point A"
					onChange={next => {
						currentValue = next ?? '';
						setValue(next);
					}}
				/>
			);
		}

		dispose = render(() => <Harness />, host);
		const input = host.querySelector<HTMLInputElement>('.combobox-input');
		expect(input).not.toBeNull();
		await settle();
		expect(input?.value).toBe('Left eye');

		input?.focus();
		await settle();
		expect(input?.value).toBe('');

		if (!input) return;
		input.value = 'Left shoulder';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await settle();

		expect(currentValue).toBe('pose:11');
		expect(input.value).toBe('Left shoulder');
	});
});

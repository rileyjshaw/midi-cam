// @vitest-environment jsdom

import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LandmarkCombobox } from './LandmarkCombobox';
import { LANDMARK_DIAGRAMS } from './landmark-diagrams';
import { LANDMARK_BY_ID } from './landmarks';
import { BODY_TRACKING_OPTIONS } from './body-tracking';

const settle = () => new Promise<void>(resolve => window.queueMicrotask(() => window.queueMicrotask(resolve)));

describe('landmark combobox', () => {
	let dispose: (() => void) | undefined;

	beforeEach(() => {
		vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
	});

	afterEach(() => {
		dispose?.();
		dispose = undefined;
		document.body.replaceChildren();
		vi.restoreAllMocks();
	});

	async function openPicker(initial: string | null = null) {
		const host = document.createElement('div');
		document.body.append(host);
		const [value, setValue] = createSignal(initial);
		dispose = render(() => <LandmarkCombobox value={value()} label="Point A" onChange={setValue} />, host);
		const input = host.querySelector<HTMLInputElement>('.combobox-input')!;
		input.focus();
		await settle();
		return { input, value, setValue };
	}

	function point(id: string) {
		const element = document.querySelector<HTMLButtonElement>(`[data-point-id="${id}"]`);
		expect(element, `diagram point ${id}`).not.toBeNull();
		return element!;
	}

	function button(label: string) {
		const element = [...document.querySelectorAll<HTMLButtonElement>('.landmark-skeleton button')].find(
			button => button.getAttribute('aria-label') === label || button.textContent?.trim() === label,
		);
		expect(element, `button ${label}`).toBeDefined();
		return element!;
	}

	it('preserves the selected list option and its keyboard position when reopening', async () => {
		const { input } = await openPicker('pose:37');
		const activeOption = () => document.getElementById(input.getAttribute('aria-activedescendant') ?? '');
		expect(activeOption()?.getAttribute('data-landmark-id')).toBe('pose:37');
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		await settle();
		expect(activeOption()?.getAttribute('data-landmark-id')).toBe('pose:38');
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();
		input.click();
		await settle();
		expect(activeOption()?.getAttribute('data-landmark-id')).toBe('pose:37');
		const trigger = document.querySelector<HTMLButtonElement>('.combobox-trigger')!;
		expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
		expect(document.getElementById(trigger.getAttribute('aria-controls')!)?.getAttribute('role')).toBe('listbox');
	});

	it.each([null, 'pose:37'])(
		'preserves typing that reopens the picker after Escape (selection %s)',
		async initial => {
			const { input, value } = await openPicker(initial);
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			await settle();
			expect(input.getAttribute('aria-expanded')).toBe('false');
			expect(document.activeElement).toBe(input);
			input.value = 'm';
			input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'm', inputType: 'insertText' }));
			await settle();
			expect(input.getAttribute('aria-expanded')).toBe('true');
			expect(input.value).toBe('m');
			expect(value()).toBe(initial);
			expect(document.querySelector('[data-landmark-id="face:4"]')).toBeNull();
		},
	);

	it('keeps focus in the picker after a real mouse activation of a region', async () => {
		const { input } = await openPicker();
		const region = button('Explore face');
		region.focus();
		region.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		await settle();
		expect(document.activeElement).toBe(button('Body'));
		expect(input.getAttribute('aria-expanded')).toBe('true');
		const settings = button('Face settings');
		expect(settings.hasAttribute('aria-controls')).toBe(false);
		settings.click();
		expect(document.getElementById(settings.getAttribute('aria-controls')!)).not.toBeNull();
		settings.click();
		expect(settings.hasAttribute('aria-controls')).toBe(false);
	});

	it('opens each hand and face without selecting, then commits the chosen landmark', async () => {
		const { input, value } = await openPicker();
		for (const [region, detail] of [
			['left hand', 'Left hand'],
			['right hand', 'Right hand'],
			['face', 'Face'],
		]) {
			button(`Explore ${region}`).click();
			await settle();
			expect(value()).toBeNull();
			expect(input.getAttribute('aria-expanded')).toBe('true');
			expect(document.querySelector(`[aria-label="${detail} landmarks"]`)).not.toBeNull();
			button('Body').click();
			await settle();
		}
		button('Explore left hand').click();
		point('hand:left:8').click();
		await settle();
		expect(value()).toBe('hand:left:8');
		expect(input.value).toBe('Left index tip');
		expect(input.getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe(input);
	});

	it('previews a collapsed group without selecting and restores its collapsed state on leave', async () => {
		const { value } = await openPicker();
		const group = () =>
			[...document.querySelectorAll<HTMLButtonElement>('.combobox-section-button')].find(button =>
				button.textContent?.includes('BODY'),
			)!;
		group().click();
		await settle();
		expect(group().getAttribute('aria-expanded')).toBe('false');
		expect(document.querySelector('[data-landmark-id="pose:11"]')).toBeNull();
		point('pose:11').dispatchEvent(new Event('pointerenter'));
		await settle();
		expect(document.querySelector('[data-landmark-id="pose:11"]')?.hasAttribute('data-previewed')).toBe(true);
		expect(group().getAttribute('aria-expanded')).toBe('true');
		expect(value()).toBeNull();
		point('pose:11').dispatchEvent(new Event('pointerleave'));
		await settle();
		expect(group().getAttribute('aria-expanded')).toBe('false');
	});

	it('reveals a visual preview while preserving the typed search', async () => {
		const { input, value } = await openPicker();
		input.value = 'no match';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		await settle();
		expect(document.querySelector('.landmark-picker-empty')).not.toBeNull();
		point('pose:25').dispatchEvent(new Event('pointerenter'));
		await settle();
		expect(document.querySelector('[data-landmark-id="pose:25"]')?.hasAttribute('data-previewed')).toBe(true);
		expect(input.value).toBe('no match');
		point('pose:25').click();
		await settle();
		expect(value()).toBe('pose:25');
		expect(input.value).toBe('Left knee');
	});

	it('links list keyboard focus to the correct detailed diagram', async () => {
		const { input, value } = await openPicker();
		input.value = 'hand:right:8';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		await settle();
		expect(point('hand:right:8').classList.contains('is-active')).toBe(true);
		expect(value()).toBeNull();
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await settle();
		expect(value()).toBe('hand:right:8');
		input.click();
		await settle();
		expect(point('hand:right:8').getAttribute('aria-pressed')).toBe('true');
	});

	it('links list pointer hover to the corresponding body point', async () => {
		await openPicker();
		const item = document.querySelector<HTMLElement>('[data-landmark-id="pose:11"]')!;
		item.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', bubbles: true }));
		await settle();
		expect(point('pose:11').classList.contains('is-active')).toBe(true);
	});

	it('offers a tabbable diagram trigger, arrow navigation, and Escape to return to search', async () => {
		const { input, value } = await openPicker();
		expect(input.getAttribute('aria-label')).toBe('Point A');
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
		await settle();
		expect(input.getAttribute('aria-expanded')).toBe('false');
		const trigger = document.querySelector<HTMLButtonElement>('.combobox-trigger')!;
		expect(trigger.tabIndex).toBe(0);
		expect(trigger.getAttribute('aria-label')).toBe('Explore landmarks for Point A');
		trigger.focus();
		// Native buttons dispatch click for Enter/Space; jsdom does not simulate that default action.
		trigger.click();
		await settle();
		expect(input.getAttribute('aria-expanded')).toBe('true');
		expect(document.activeElement).toBe(button('Body'));
		expect(point('face:478').tabIndex).toBe(0);
		point('face:478').focus();
		point('face:478').dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
		);
		await settle();
		expect(document.activeElement).toBe(point('pose:38'));
		expect(document.querySelector('[data-landmark-id="pose:38"]')?.hasAttribute('data-previewed')).toBe(true);
		expect(value()).toBeNull();
		point('pose:38').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();
		expect(input.getAttribute('aria-expanded')).toBe('false');
		await new Promise(resolve => window.setTimeout(resolve, 0));
		expect(document.activeElement).toBe(input);
	});

	it('retains screen points and the separate body-tracked hand center', async () => {
		const { input, value } = await openPicker();
		button('Screen').click();
		point('screen:bottom-right').click();
		await settle();
		expect(value()).toBe('screen:bottom-right');
		input.click();
		await settle();
		button('Body').click();
		button('Explore right hand').click();
		button('Right hand settings').click();
		document.querySelector<HTMLInputElement>('[aria-label="Use body tracking for hand center"]')!.click();
		button('Right hand settings').click();
		point('pose:35').click();
		await settle();
		expect(value()).toBe('pose:35');
	});

	it('opens face settings in place, returns with Escape, and selects a body-tracked center', async () => {
		const { input, value } = await openPicker('face:473');
		button('Face settings').click();
		await settle();
		expect(document.querySelector('.landmark-diagram')).toBeNull();
		const option = document.querySelector<HTMLInputElement>('[aria-label="Use body tracking for face center"]')!;
		option.focus();
		option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		await settle();
		expect(input.getAttribute('aria-expanded')).toBe('true');
		expect(document.activeElement).toBe(button('Face settings'));
		expect(point('face:473')).not.toBeNull();
		expect(value()).toBe('face:473');
		button('Face settings').click();
		document.querySelector<HTMLInputElement>('[aria-label="Use body tracking for face center"]')!.click();
		button('Face settings').click();
		point('pose:39').click();
		await settle();
		expect(value()).toBe('pose:39');
		expect(input.getAttribute('aria-expanded')).toBe('false');
		input.click();
		await settle();
		expect(document.querySelector('[aria-label="Face landmarks"]')).not.toBeNull();
		button('Face settings').click();
		document.querySelector<HTMLInputElement>('[aria-label="Use body tracking for face center"]')!.click();
		button('Face settings').click();
		point('face:478').click();
		await settle();
		expect(value()).toBe('face:478');
	});

	it.each(BODY_TRACKING_OPTIONS)(
		'switches $view $label to body tracking and preserves the choice on reopen',
		async option => {
			const initial =
				option.view === 'face' ? 'face:473' : option.view === 'left-hand' ? 'hand:left:12' : 'hand:right:12';
			const { input, value } = await openPicker(initial);
			const title = option.view === 'face' ? 'Face' : option.view === 'left-hand' ? 'Left hand' : 'Right hand';
			const setting = () =>
				document.querySelector<HTMLInputElement>(
					`[aria-label="Use body tracking for ${option.label.toLowerCase()}"]`,
				)!;
			button(`${title} settings`).click();
			expect(setting().checked).toBe(false);
			setting().click();
			expect(setting().checked).toBe(true);
			expect(value()).toBe(initial);
			expect(document.querySelector('.landmark-settings')).not.toBeNull();
			button(`${title} settings`).click();
			expect(point(option.poseId).title).toBe(LANDMARK_BY_ID.get(option.poseId)?.label);
			if (option.detailedId) expect(document.querySelector(`[data-point-id="${option.detailedId}"]`)).toBeNull();
			point(option.poseId).click();
			await settle();
			expect(value()).toBe(option.poseId);
			expect(input.getAttribute('aria-expanded')).toBe('false');
			input.click();
			await settle();
			expect(point(option.poseId).getAttribute('aria-pressed')).toBe('true');
			button(`${title} settings`).click();
			expect(setting().checked).toBe(true);
			setting().click();
			button(`${title} settings`).click();
			expect(document.querySelector(`[data-point-id="${option.poseId}"]`)).toBeNull();
			if (option.detailedId) {
				point(option.detailedId).click();
				await settle();
				expect(value()).toBe(option.detailedId);
			}
		},
	);

	it('represents every existing landmark with valid diagram IDs', () => {
		const ids = new Set(Object.values(LANDMARK_DIAGRAMS).flatMap(diagram => diagram.points.map(point => point.id)));
		for (const option of BODY_TRACKING_OPTIONS) ids.add(option.poseId);
		expect([...ids].sort()).toEqual([...LANDMARK_BY_ID.keys()].sort());
	});

	it('keeps keyboard focus inside the picker when entering and leaving details', async () => {
		const { input, value } = await openPicker('pose:11');
		button('Explore left hand').focus();
		button('Explore left hand').click();
		await settle();
		expect(document.activeElement).toBe(button('Body'));
		button('Body').click();
		await settle();
		expect(document.activeElement).toBe(button('Body'));
		expect(point('pose:11')).not.toBeNull();
		button('Body').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();
		expect(input.getAttribute('aria-expanded')).toBe('false');
		expect(value()).toBe('pose:11');
		expect(input.value).toBe('Left shoulder');
	});

	it('uses text-only Body and Screen tabs with linked panels and arrow-key switching', async () => {
		await openPicker();
		const body = button('Body');
		const screen = button('Screen');
		expect(body.getAttribute('role')).toBe('tab');
		expect(screen.getAttribute('role')).toBe('tab');
		expect(body.getAttribute('aria-selected')).toBe('true');
		expect(screen.getAttribute('aria-selected')).toBe('false');
		expect(body.querySelector('svg')).toBeNull();
		expect(screen.querySelector('svg')).toBeNull();
		body.focus();
		body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
		await settle();
		expect(document.activeElement).toBe(screen);
		expect(screen.getAttribute('aria-selected')).toBe('true');
		const panel = document.getElementById(screen.getAttribute('aria-controls')!);
		expect(panel?.getAttribute('role')).toBe('tabpanel');
		expect(panel?.getAttribute('aria-labelledby')).toBe(screen.id);
		expect(panel?.contains(point('screen:center'))).toBe(true);
		expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
		screen.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
		await settle();
		expect(body.getAttribute('aria-selected')).toBe('true');
		button('Explore left hand').click();
		await settle();
		expect(body.getAttribute('aria-selected')).toBe('true');
		expect(point('hand:left:8')).not.toBeNull();
		body.click();
		await settle();
		expect(point('pose:11')).not.toBeNull();
	});

	it('leaves F6 available to the browser', async () => {
		const { input } = await openPicker();
		const event = new KeyboardEvent('keydown', { key: 'F6', bubbles: true, cancelable: true });
		input.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(document.activeElement).toBe(input);
	});

	it('closes and retains the value when the selected diagram point is chosen again', async () => {
		const { input, value } = await openPicker('face:473');
		point('face:473').click();
		await settle();
		expect(value()).toBe('face:473');
		expect(input.value).toBe('Left eye');
		expect(input.getAttribute('aria-expanded')).toBe('false');
	});

	it('follows external value changes and can preview the same list point after returning to Body', async () => {
		const { setValue } = await openPicker();
		setValue('hand:right:8');
		await settle();
		expect(point('hand:right:8').getAttribute('aria-pressed')).toBe('true');
		for (let i = 0; i < 2; i++) {
			button('Body').click();
			point('face:478').dispatchEvent(new Event('pointerleave'));
			const item = document.querySelector<HTMLElement>('[data-landmark-id="hand:right:8"]')!;
			item.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', bubbles: true }));
			await settle();
			expect(point('hand:right:8').classList.contains('is-active')).toBe(true);
		}
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

	it('keeps the current value selected and closes when it is chosen again', async () => {
		const host = document.createElement('div');
		document.body.append(host);
		let currentValue = 'face:473';

		function Harness() {
			const [value, setValue] = createSignal<string | null>(currentValue);
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

		input?.focus();
		await settle();
		if (!input) return;
		input.value = 'face:473';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await settle();

		expect(currentValue).toBe('face:473');
		expect(input.value).toBe('Left eye');
		expect(input.getAttribute('aria-expanded')).toBe('false');
	});

	it('uses case-insensitive substring matching without loose fuzzy results', async () => {
		const host = document.createElement('div');
		document.body.append(host);

		dispose = render(() => <LandmarkCombobox value={null} label="Point A" onChange={() => undefined} />, host);
		const input = host.querySelector<HTMLInputElement>('.combobox-input');
		input?.focus();
		await settle();
		if (!input) return;

		input.value = 'Right c';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		await settle();

		const visibleLabels = () =>
			[...document.querySelectorAll<HTMLElement>('.combobox-item')].map(item => item.textContent ?? '');
		expect(visibleLabels().some(label => label.includes('Right cheek'))).toBe(true);
		expect(visibleLabels().some(label => label.includes('Right eye'))).toBe(false);

		input.value = 'ChE';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		await settle();

		expect(visibleLabels().some(label => label.includes('Right cheek'))).toBe(true);
	});
});

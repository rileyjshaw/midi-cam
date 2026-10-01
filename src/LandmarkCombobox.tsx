import * as Combobox from '@kobalte/core/combobox';
import { Check, ChevronDown, Search } from 'lucide-solid';
import { createEffect, createMemo, createSignal, createUniqueId, on, Show } from 'solid-js';
import { LANDMARK_BY_ID, LANDMARK_GROUPS, LANDMARK_OPTIONS } from './landmarks';
import { LandmarkSkeleton } from './LandmarkSkeleton';
import type { LandmarkOption } from './types';

interface LandmarkComboboxProps {
	value: string | null;
	label: string;
	onChange: (value: string | null) => void;
}

interface GroupHeader {
	kind: 'group';
	id: string;
	label: string;
	detail: string;
	searchText: string;
	group: string;
	count: number;
}

type ComboboxEntry = LandmarkOption | GroupHeader;

function isGroupHeader(entry: ComboboxEntry): entry is GroupHeader {
	return 'kind' in entry && entry.kind === 'group';
}

const GROUP_BY_OPTION = new Map(
	LANDMARK_GROUPS.flatMap(group => group.options.map(option => [option.id, group.label] as const)),
);

const GROUP_HEADERS = new Map(
	LANDMARK_GROUPS.map(
		group =>
			[
				group.label,
				{
					kind: 'group' as const,
					id: `group:${group.label.toLowerCase()}`,
					label: group.label,
					detail: '',
					searchText: group.label.toLowerCase(),
					group: group.label,
					count: group.options.length,
				},
			] as const,
	),
);

export function LandmarkCombobox(props: LandmarkComboboxProps) {
	const [bodyTracked, setBodyTracked] = createSignal<ReadonlySet<string>>(new Set());
	const setBodyTracking = (id: string, enabled: boolean) => {
		setBodyTracked(current => {
			if (current.has(id) === enabled) return current;
			const next = new Set(current);
			if (enabled) next.add(id);
			else next.delete(id);
			return next;
		});
	};
	const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set());
	const [searchQuery, setSearchQuery] = createSignal('');
	const [clearSearchOnOpen, setClearSearchOnOpen] = createSignal(true);
	const [previewId, setPreviewId] = createSignal<string | null>(null);
	const selected = createMemo(() => (props.value ? (LANDMARK_BY_ID.get(props.value) ?? null) : null));
	let listElement: HTMLUListElement | undefined;
	const keyboardHelpId = createUniqueId();
	const diagramId = createUniqueId();
	const itemElements = new Map<string, HTMLElement>();
	const isCollapsed = (group: string) => collapsed().has(group) && GROUP_BY_OPTION.get(previewId() ?? '') !== group;
	const previewLandmark = (id: string | null) => {
		setPreviewId(id);
		if (!id) return;
		window.queueMicrotask(() => {
			const item = itemElements.get(id);
			if (!item || !listElement) return;
			const itemRect = item.getBoundingClientRect();
			const listRect = listElement.getBoundingClientRect();
			if (itemRect.top < listRect.top) listElement.scrollTop += itemRect.top - listRect.top;
			else if (itemRect.bottom > listRect.bottom) listElement.scrollTop += itemRect.bottom - listRect.bottom;
		});
	};

	const toggleGroup = (label: string) => {
		setCollapsed(current => {
			const next = new Set(current);
			if (next.has(label)) next.delete(label);
			else next.add(label);
			return next;
		});
	};

	const visibleEntries = createMemo<ComboboxEntry[]>(() => {
		const query = searchQuery().trim().toLowerCase().replace(/\s+/g, ' ');
		const options = query
			? LANDMARK_OPTIONS.filter(option => option.searchText.includes(query) || option.id === previewId())
			: LANDMARK_OPTIONS;
		return LANDMARK_GROUPS.flatMap(group => {
			const matches = options.filter(option => GROUP_BY_OPTION.get(option.id) === group.label);
			const header = GROUP_HEADERS.get(group.label);
			if (!header || (query && !matches.length)) return [];
			return isCollapsed(group.label) ? [header] : [header, ...matches];
		});
	});

	return (
		<Combobox.Root<ComboboxEntry>
			class="landmark-combobox"
			sameWidth={false}
			placement="bottom-start"
			gutter={2}
			options={visibleEntries()}
			optionValue="id"
			optionLabel="label"
			optionTextValue="searchText"
			optionDisabled={isGroupHeader}
			value={selected()}
			disallowEmptySelection
			onChange={entry => {
				const option = entry && !isGroupHeader(entry) ? entry : null;
				props.onChange(option?.id ?? null);
			}}
			onOpenChange={(open, triggerMode) => {
				setPreviewId(null);
				if (open) setClearSearchOnOpen(triggerMode !== 'input');
			}}
			onInputChange={setSearchQuery}
			defaultFilter={() => true}
			triggerMode="focus"
			placeholder="Choose landmark"
			allowsEmptyCollection
			itemComponent={itemProps => {
				const entry = itemProps.item.rawValue;
				if (isGroupHeader(entry)) {
					return (
						<li class="combobox-section" role="presentation">
							<button
								type="button"
								class="combobox-section-button"
								onPointerDown={event => {
									event.preventDefault();
									event.stopPropagation();
								}}
								onClick={event => {
									event.stopPropagation();
									toggleGroup(entry.group);
								}}
								aria-expanded={!isCollapsed(entry.group)}
							>
								<ChevronDown size={14} classList={{ collapsed: isCollapsed(entry.group) }} />
								{entry.label}
								<span>{entry.count}</span>
							</button>
						</li>
					);
				}

				return (
					<Combobox.Item
						item={itemProps.item}
						class="combobox-item"
						ref={element => itemElements.set(entry.id, element)}
						data-landmark-id={entry.id}
						data-previewed={previewId() === entry.id ? '' : undefined}
					>
						<span>
							<Combobox.ItemLabel>{entry.label}</Combobox.ItemLabel>
							<small>{entry.detail}</small>
						</span>
						<Combobox.ItemIndicator class="combobox-check">
							<Check size={15} />
						</Combobox.ItemIndicator>
					</Combobox.Item>
				);
			}}
		>
			<Combobox.Control class="combobox-control" aria-label={props.label}>
				<Search size={14} class="combobox-search" />
				<LandmarkPickerInput
					label={props.label}
					helpId={keyboardHelpId}
					clearSearchOnOpen={clearSearchOnOpen()}
				/>
				<LandmarkPickerTrigger label={props.label} />
			</Combobox.Control>
			<span class="sr-only" id={keyboardHelpId}>
				Use arrow keys to browse the list and Enter to select. To explore visually, Tab to the Explore landmarks
				button and press Enter or Space.
			</span>
			<Combobox.Portal>
				{/* Kobalte's internal top-layer marker exempts this portal from the dialog's aria hiding and focus trap. */}
				<Combobox.Content
					data-kb-top-layer=""
					class="combobox-content landmark-picker-content"
					data-previewing={previewId() ? '' : undefined}
				>
					<div class="landmark-picker-list">
						<Combobox.Listbox ref={listElement} class="combobox-listbox" />
						<Show when={!visibleEntries().length}>
							<p class="landmark-picker-empty">No matching landmarks</p>
						</Show>
					</div>
					<LinkedLandmarkSkeleton
						id={diagramId}
						value={props.value}
						onPreview={previewLandmark}
						bodyTracked={bodyTracked()}
						onBodyTrackingChange={setBodyTracking}
					/>
				</Combobox.Content>
			</Combobox.Portal>
		</Combobox.Root>
	);
}

function LandmarkPickerInput(props: { label: string; helpId: string; clearSearchOnOpen: boolean }) {
	const context = Combobox.useComboboxContext();
	createEffect(
		on(context.isOpen, open => {
			window.queueMicrotask(() => {
				if (context.isOpen() !== open) return;
				const manager = context.listState().selectionManager();
				if (open) {
					if (!props.clearSearchOnOpen) return;
					// Kobalte clears focus with the search. Restore it after the collection is unfiltered.
					const focusedKey = manager.focusedKey();
					context.setInputValue('');
					manager.setFocusedKey(focusedKey);
				} else context.resetInputValue(manager.selectedKeys());
			});
		}),
	);
	return <Combobox.Input aria-label={props.label} aria-describedby={props.helpId} class="combobox-input" />;
}

function LandmarkPickerTrigger(props: { label: string }) {
	const context = Combobox.useComboboxContext();
	return (
		<Combobox.Trigger
			class="combobox-trigger"
			tabIndex={0}
			aria-label={`Explore landmarks for ${props.label}`}
			title="Explore landmarks"
			onClick={event => {
				if (event.detail !== 0) return;
				context.open(false, 'manual');
				window.queueMicrotask(() => {
					context.contentRef()?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
				});
			}}
		>
			<Combobox.Icon>
				<ChevronDown size={15} />
			</Combobox.Icon>
		</Combobox.Trigger>
	);
}

function LinkedLandmarkSkeleton(props: {
	id: string;
	value: string | null;
	onPreview: (id: string | null) => void;
	bodyTracked: ReadonlySet<string>;
	onBodyTrackingChange: (id: string, enabled: boolean) => void;
}) {
	const context = Combobox.useComboboxContext();
	return (
		<LandmarkSkeleton
			id={props.id}
			value={props.value}
			bodyTracked={props.bodyTracked}
			onBodyTrackingChange={props.onBodyTrackingChange}
			activeId={context.listState().selectionManager().focusedKey()}
			onPreview={props.onPreview}
			onNavigate={() => context.listState().selectionManager().setFocusedKey(undefined)}
			onSelect={id => {
				props.onPreview(id);
				context.listState().selectionManager().setSelectedKeys([id]);
				context.resetInputValue(new Set([id]));
				context.close();
			}}
		/>
	);
}

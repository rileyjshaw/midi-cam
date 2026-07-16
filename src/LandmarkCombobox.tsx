import * as Combobox from '@kobalte/core/combobox';
import Fuse from 'fuse.js';
import { Check, ChevronDown, Search } from 'lucide-solid';
import { createMemo, createSignal } from 'solid-js';
import { LANDMARK_BY_ID, LANDMARK_GROUPS, LANDMARK_OPTIONS } from './landmarks';
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

const LANDMARK_SEARCH = new Fuse(LANDMARK_OPTIONS, {
	keys: ['searchText'],
	threshold: 0.4,
	ignoreLocation: true,
});

export function LandmarkCombobox(props: LandmarkComboboxProps) {
	const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set());
	const [searchQuery, setSearchQuery] = createSignal('');
	const selected = createMemo(() => (props.value ? (LANDMARK_BY_ID.get(props.value) ?? null) : null));
	let inputElement: HTMLInputElement | undefined;

	const setInputText = (value: string) => {
		if (!inputElement) return;
		inputElement.value = value;
	};

	const setSearchText = (value: string) => {
		if (!inputElement) return;
		inputElement.value = value;
		inputElement.dispatchEvent(new Event('input', { bubbles: true }));
	};

	const clearSearch = () => setSearchText('');
	const restoreSelection = () => setInputText(selected()?.label ?? '');

	const toggleGroup = (label: string) => {
		setCollapsed(current => {
			const next = new Set(current);
			if (next.has(label)) next.delete(label);
			else next.add(label);
			return next;
		});
	};

	const visibleEntries = createMemo<ComboboxEntry[]>(() => {
		const query = searchQuery().trim();
		const options = query ? LANDMARK_SEARCH.search(query).map(result => result.item) : LANDMARK_OPTIONS;
		return LANDMARK_GROUPS.flatMap(group => {
			const matches = options.filter(option => GROUP_BY_OPTION.get(option.id) === group.label);
			const header = GROUP_HEADERS.get(group.label);
			if (!header || (query && !matches.length)) return [];
			return collapsed().has(group.label) ? [header] : [header, ...matches];
		});
	});

	return (
		<Combobox.Root<ComboboxEntry>
			class="landmark-combobox"
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
				window.queueMicrotask(() => setInputText(option?.label ?? ''));
			}}
			onOpenChange={open => {
				window.queueMicrotask(open ? clearSearch : restoreSelection);
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
								aria-expanded={!collapsed().has(entry.group)}
							>
								<ChevronDown size={14} classList={{ collapsed: collapsed().has(entry.group) }} />
								{entry.label}
								<span>{entry.count}</span>
							</button>
						</li>
					);
				}

				return (
					<Combobox.Item item={itemProps.item} class="combobox-item">
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
				<Combobox.Input
					ref={element => {
						inputElement = element;
					}}
					class="combobox-input"
				/>
				<Combobox.Trigger class="combobox-trigger" aria-label={`Open ${props.label}`}>
					<Combobox.Icon>
						<ChevronDown size={15} />
					</Combobox.Icon>
				</Combobox.Trigger>
			</Combobox.Control>
			<Combobox.Portal>
				<Combobox.Content class="combobox-content">
					<Combobox.Listbox class="combobox-listbox" />
				</Combobox.Content>
			</Combobox.Portal>
		</Combobox.Root>
	);
}

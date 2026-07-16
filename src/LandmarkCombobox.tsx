import * as Combobox from '@kobalte/core/combobox'
import { Check, ChevronDown, Search } from 'lucide-solid'
import { createMemo, createSignal } from 'solid-js'
import { LANDMARK_BY_ID, LANDMARK_GROUPS } from './landmarks'
import type { LandmarkOption } from './types'

interface LandmarkComboboxProps {
  value: string | null
  label: string
  onChange: (value: string | null) => void
}

interface GroupHeader {
  kind: 'group'
  id: string
  label: string
  detail: string
  searchText: string
  group: string
  count: number
}

type ComboboxEntry = LandmarkOption | GroupHeader

function isGroupHeader(entry: ComboboxEntry): entry is GroupHeader {
  return 'kind' in entry && entry.kind === 'group'
}

const GROUP_BY_OPTION = new Map(
  LANDMARK_GROUPS.flatMap((group) => group.options.map((option) => [option.id, group.label] as const)),
)

const COMBOBOX_ENTRIES: ComboboxEntry[] = LANDMARK_GROUPS.flatMap((group) => [
  {
    kind: 'group' as const,
    id: `group:${group.label.toLowerCase()}`,
    label: group.label,
    detail: '',
    searchText: group.label.toLowerCase(),
    group: group.label,
    count: group.options.length,
  },
  ...group.options,
])

export function LandmarkCombobox(props: LandmarkComboboxProps) {
  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set())
  const selected = createMemo(() => (props.value ? LANDMARK_BY_ID.get(props.value) ?? null : null))
  let inputElement: HTMLInputElement | undefined

  const clearSearch = () => {
    if (!inputElement) return
    inputElement.value = ''
    inputElement.dispatchEvent(new Event('input', { bubbles: true }))
  }

  const toggleGroup = (label: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const filterEntry = (entry: ComboboxEntry, inputValue: string) => {
    const query = inputValue.trim().toLowerCase()
    if (query) {
      if (isGroupHeader(entry)) {
        const group = LANDMARK_GROUPS.find((candidate) => candidate.label === entry.group)
        return Boolean(group?.options.some((option) => option.searchText.includes(query)))
      }
      return entry.searchText.includes(query)
    }

    if (isGroupHeader(entry)) return true
    return !collapsed().has(GROUP_BY_OPTION.get(entry.id) ?? '')
  }

  return (
    <Combobox.Root<ComboboxEntry>
      class="landmark-combobox"
      options={COMBOBOX_ENTRIES}
      optionValue="id"
      optionLabel="label"
      optionTextValue="searchText"
      optionDisabled={isGroupHeader}
      value={selected()}
      onChange={(entry) => props.onChange(entry && !isGroupHeader(entry) ? entry.id : null)}
      onOpenChange={(open) => {
        if (open) window.queueMicrotask(clearSearch)
      }}
      defaultFilter={filterEntry}
      triggerMode="focus"
      placeholder="Choose landmark"
      allowsEmptyCollection
      itemComponent={(itemProps) => {
        const entry = itemProps.item.rawValue
        if (isGroupHeader(entry)) {
          return (
            <li class="combobox-section" role="presentation">
              <button
                type="button"
                class="combobox-section-button"
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleGroup(entry.group)
                }}
                aria-expanded={!collapsed().has(entry.group)}
              >
                <ChevronDown
                  size={14}
                  classList={{ collapsed: collapsed().has(entry.group) }}
                />
                {entry.label}
                <span>{entry.count}</span>
              </button>
            </li>
          )
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
        )
      }}
    >
      <Combobox.Control class="combobox-control" aria-label={props.label}>
        <Search size={14} class="combobox-search" />
        <Combobox.Input
          ref={(element) => { inputElement = element }}
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
  )
}

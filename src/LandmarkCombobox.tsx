import * as Combobox from '@kobalte/core/combobox'
import { Check, ChevronDown, Search } from 'lucide-solid'
import { createMemo, createSignal } from 'solid-js'
import { LANDMARK_BY_ID, LANDMARK_GROUPS } from './landmarks'
import type { LandmarkGroup, LandmarkOption } from './types'

interface LandmarkComboboxProps {
  value: string | null
  label: string
  onChange: (value: string | null) => void
}

export function LandmarkCombobox(props: LandmarkComboboxProps) {
  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set())
  const [query, setQuery] = createSignal('')
  const selected = createMemo(() => (props.value ? LANDMARK_BY_ID.get(props.value) ?? null : null))
  const groups = createMemo(() =>
    LANDMARK_GROUPS.map((group) => ({
      ...group,
      options: query().trim() || !collapsed().has(group.label) ? group.options : [],
    })),
  )

  const toggleGroup = (label: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  return (
    <Combobox.Root<LandmarkOption, LandmarkGroup>
      class="landmark-combobox"
      options={groups()}
      optionValue="id"
      optionLabel="label"
      optionTextValue="searchText"
      optionGroupChildren="options"
      value={selected()}
      onChange={(option) => props.onChange(option?.id ?? null)}
      onInputChange={setQuery}
      defaultFilter="contains"
      placeholder="Choose landmark"
      allowsEmptyCollection
      itemComponent={(itemProps) => (
        <Combobox.Item item={itemProps.item} class="combobox-item">
          <span>
            <Combobox.ItemLabel>{itemProps.item.rawValue.label}</Combobox.ItemLabel>
            <small>{itemProps.item.rawValue.detail}</small>
          </span>
          <Combobox.ItemIndicator class="combobox-check">
            <Check size={15} />
          </Combobox.ItemIndicator>
        </Combobox.Item>
      )}
      sectionComponent={(sectionProps) => (
        <Combobox.Section class="combobox-section">
          <button
            type="button"
            class="combobox-section-button"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => toggleGroup(sectionProps.section.rawValue.label)}
            aria-expanded={!collapsed().has(sectionProps.section.rawValue.label)}
          >
            <ChevronDown
              size={14}
              classList={{ collapsed: collapsed().has(sectionProps.section.rawValue.label) }}
            />
            {sectionProps.section.rawValue.label}
            <span>{sectionProps.section.rawValue.options.length}</span>
          </button>
        </Combobox.Section>
      )}
    >
      <Combobox.Control class="combobox-control" aria-label={props.label}>
        <Search size={14} class="combobox-search" />
        <Combobox.Input class="combobox-input" />
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

'use client';
import { useRef } from 'react';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';
type Item = { value: string; label: string };
export function SearchPicker({
  value,
  onChange,
  items,
  label,
  inputId,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  items: Item[];
  label: string;
  inputId?: string;
  disabled?: boolean;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  return (
    <div className="search-picker" ref={anchor}>
      <Combobox
        disabled={disabled}
        items={items}
        value={items.find((i) => i.value === value) || null}
        onValueChange={(item: Item | null) => {
          if (item) onChange(item.value);
        }}
        itemToStringLabel={(item: Item) => item.label}
        isItemEqualToValue={(a: Item, b: Item) => a.value === b.value}
      >
        <ComboboxInput
          id={inputId}
          aria-label={label}
          placeholder="Search by ticker or company…"
        />
        <ComboboxContent className="search-picker-menu" anchor={anchor}>
          <ComboboxEmpty>No matching stock.</ComboboxEmpty>
          <ComboboxList>
            {(item: Item) => (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

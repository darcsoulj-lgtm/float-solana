'use client';
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
}: {
  value: string;
  onChange: (value: string) => void;
  items: Item[];
  label: string;
}) {
  return (
    <Combobox
      items={items}
      value={items.find((i) => i.value === value) || null}
      onValueChange={(item: Item | null) => {
        if (item) onChange(item.value);
      }}
      itemToStringLabel={(item: Item) => item.label}
      isItemEqualToValue={(a: Item, b: Item) => a.value === b.value}
    >
      <ComboboxInput
        aria-label={label}
        placeholder="Search by ticker or company…"
      />
      <ComboboxContent>
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
  );
}

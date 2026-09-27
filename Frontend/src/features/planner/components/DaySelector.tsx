import { Pressable, ScrollView, Text } from 'react-native';

import { spacing } from '@/constants/theme';
import { DAY_NAMES, DAY_SHORT_NAMES } from '@/lib/format';
import { DayOfWeek } from '@/types/api';

interface DaySelectorProps {
  selected: DayOfWeek;
  onSelect: (day: DayOfWeek) => void;
}

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Horizontally scrollable day chips (44dp tall). Selection is shown by fill and announced to screen readers. */
export function DaySelector({ selected, onSelect }: DaySelectorProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -spacing.xl }}
      contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}
      accessibilityRole="tablist"
    >
      {DAYS.map((day) => {
        const isSelected = day === selected;
        return (
          <Pressable
            key={day}
            onPress={() => onSelect(day)}
            accessibilityRole="tab"
            accessibilityLabel={DAY_NAMES[day]}
            accessibilityState={{ selected: isSelected }}
            className={`min-h-11 min-w-14 items-center justify-center rounded-full border px-lg ${
              isSelected ? 'border-navy bg-navy' : 'border-neutral-100 bg-neutral-100 active:bg-neutral-200'
            }`}
          >
            <Text className={`text-label ${isSelected ? 'font-semibold text-white' : 'text-navy'}`}>{DAY_SHORT_NAMES[day]}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

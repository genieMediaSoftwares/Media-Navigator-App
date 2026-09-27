import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DAY_NAMES, DAY_SHORT_NAMES, formatHourRange } from '@/lib/format';
import { DayOfWeek, TimingCell } from '@/types/api';

// Five intensity steps. Literal class strings so Tailwind can generate them.
const INTENSITY_CLASSES = ['bg-violet/10', 'bg-violet/25', 'bg-violet/45', 'bg-violet/70', 'bg-violet'] as const;

function intensityClass(score: number): string {
  const step = Math.min(INTENSITY_CLASSES.length - 1, Math.max(0, Math.floor(score / 20)));
  return INTENSITY_CLASSES[step];
}

interface TimingHeatmapProps {
  cells: TimingCell[];
  selectedDay: DayOfWeek;
  onSelectDay: (day: DayOfWeek) => void;
}

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * Days × time-slot matrix built only from cells returned by the API. Slots with no data render
 * as empty outlines. Exact scores are exposed via accessibility labels and the windows list,
 * so meaning never depends on color alone.
 */
export function TimingHeatmap({ cells, selectedDay, onSelectDay }: TimingHeatmapProps) {
  const { slots, lookup } = useMemo(() => {
    const byKey = new Map<string, TimingCell>();
    const slotMap = new Map<string, { startHour: number; endHour: number }>();
    for (const cell of cells) {
      byKey.set(`${cell.dayOfWeek}:${cell.startHour}`, cell);
      slotMap.set(`${cell.startHour}-${cell.endHour}`, { startHour: cell.startHour, endHour: cell.endHour });
    }
    return { slots: [...slotMap.values()].sort((a, b) => a.startHour - b.startHour), lookup: byKey };
  }, [cells]);

  return (
    <View>
      <View className="mb-xs flex-row">
        <View className="w-16" />
        {DAYS.map((day) => (
          <Text
            key={day}
            className={`flex-1 text-center text-caption ${day === selectedDay ? 'font-bold text-violet' : 'text-neutral-500'}`}
            importantForAccessibility="no"
          >
            {DAY_SHORT_NAMES[day].slice(0, 1)}
          </Text>
        ))}
      </View>

      {slots.map((slot) => (
        <View key={slot.startHour} className="mb-xs flex-row items-center">
          <Text className="w-16 pr-xs text-caption text-neutral-500" numberOfLines={1} adjustsFontSizeToFit>
            {formatHourRange(slot.startHour, slot.endHour)}
          </Text>
          {DAYS.map((day) => {
            const cell = lookup.get(`${day}:${slot.startHour}`);
            const label = `${DAY_NAMES[day]}, ${formatHourRange(slot.startHour, slot.endHour)}: ${
              cell ? `engagement score ${Math.round(cell.score)} out of 100` : 'no data'
            }`;
            return (
              <Pressable
                key={day}
                onPress={() => onSelectDay(day)}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: day === selectedDay }}
                className="flex-1 px-[2px]"
              >
                <View
                  className={`h-9 rounded-lg ${cell ? intensityClass(cell.score) : 'bg-neutral-50'} ${
                    day === selectedDay ? 'border-2 border-navy' : ''
                  }`}
                />
              </Pressable>
            );
          })}
        </View>
      ))}

      <View className="mt-md flex-row items-center" accessible accessibilityLabel="Legend: lighter cells have lower engagement, darker cells higher">
        <Text className="mr-sm text-caption text-neutral-500">Lower</Text>
        {INTENSITY_CLASSES.map((cls) => (
          <View key={cls} className={`mr-xs h-3 w-5 rounded-sm ${cls}`} />
        ))}
        <Text className="ml-xs text-caption text-neutral-500">Higher</Text>
      </View>
    </View>
  );
}

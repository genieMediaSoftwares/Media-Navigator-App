import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { PriorityTask } from '@/types/analysis';

const IMPACT: Record<PriorityTask['impact'], { label: string; bg: string; fg: string }> = {
  high: { label: 'High impact', bg: 'bg-success-light', fg: 'text-success' },
  medium: { label: 'Medium impact', bg: 'bg-sky', fg: 'text-primary' },
  low: { label: 'Low impact', bg: 'bg-neutral-100', fg: 'text-neutral-500' },
};

/**
 * What to do next, in priority order. Each task is derived from a measured pattern; tapping a task
 * reveals the supporting numbers (progressive disclosure keeps the list scannable).
 */
export function TaskList({ tasks, compact = false }: { tasks: PriorityTask[]; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  if (tasks.length === 0) {
    return <Text className="text-label font-normal text-neutral-500">No clear priority yet. Tasks appear once your history shows a measurable pattern.</Text>;
  }
  return (
    <View className="overflow-hidden rounded-xl border border-neutral-100">
      {tasks.map((task, i) => {
        const expanded = open === task.id;
        const impact = IMPACT[task.impact];
        return (
          <Pressable
            key={task.id}
            onPress={() => setOpen(expanded ? null : task.id)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={`Priority ${task.priority}: ${task.title}. ${impact.label}. ${task.action}`}
            className={`px-lg py-md active:bg-neutral-50 ${i > 0 ? 'border-t border-neutral-100' : ''}`}
          >
            <View className="flex-row items-start">
              <View className="mr-md mt-0.5 h-7 w-7 items-center justify-center rounded-full bg-navy">
                <Text className="text-caption font-bold text-white">{task.priority}</Text>
              </View>
              <View className="flex-1">
                <View className="flex-row flex-wrap items-center">
                  <Text className="mr-sm text-title text-navy">{task.title}</Text>
                  <View className={`rounded-full px-sm py-0.5 ${impact.bg}`}>
                    <Text className={`text-caption font-semibold ${impact.fg}`}>{impact.label}</Text>
                  </View>
                </View>
                <Text className="mt-xs text-label font-normal text-navy-light">{task.action}</Text>
                {expanded ? (
                  <View className="mt-md">
                    <Text className="text-caption font-semibold uppercase tracking-wide text-neutral-500">Why</Text>
                    <Text className="mt-xs text-label font-normal text-neutral-500">{task.reason}</Text>
                    {task.supportingData.length > 0 ? (
                      <View className="mt-md rounded-lg bg-neutral-50 p-md">
                        {task.supportingData.map((e) => (
                          <View key={`${e.label}${e.value}`} className="mb-xs flex-row justify-between">
                            <Text className="mr-md flex-1 text-caption text-neutral-500">{e.label}</Text>
                            <Text className="flex-1 text-right text-caption font-semibold text-navy">{e.value}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : !compact ? (
                  <Text className="mt-xs text-caption text-primary">Show supporting data</Text>
                ) : null}
              </View>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.neutral400} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

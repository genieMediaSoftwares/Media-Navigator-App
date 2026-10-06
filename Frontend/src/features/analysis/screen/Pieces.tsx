import Ionicons from '@expo/vector-icons/Ionicons';
import { ReactNode, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { colors } from '@/constants/colors';

/** White analysis card: rounded, hairline border, very soft shadow (as in the design). */
export function AnalysisCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <View
      className={`mb-md rounded-[18px] border border-sky-border/60 bg-white p-lg ${className}`}
      style={{ shadowColor: colors.navy, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}
    >
      {children}
    </View>
  );
}

/** "↑ 28%" / "↓ 12%" / "— 0%"; nothing invented when there is no comparison. */
export function ChangeChip({ percent, size = 'sm' }: { percent: number | null; size?: 'sm' | 'lg' }) {
  if (percent === null) return null;
  const flat = Math.abs(percent) < 0.5;
  const up = percent > 0;
  const bg = flat ? 'bg-neutral-100' : up ? 'bg-success-light' : 'bg-danger-light';
  const fg = flat ? 'text-neutral-500' : up ? 'text-success' : 'text-danger';
  const color = flat ? colors.neutral500 : up ? colors.success : colors.danger;
  const text = flat ? '0%' : `${Math.abs(Math.round(percent))}%`;
  return (
    <View
      className={`flex-row items-center self-start rounded-full ${size === 'lg' ? 'px-sm py-1' : 'px-1.5 py-0.5'} ${bg}`}
      accessible
      accessibilityLabel={flat ? 'No change' : `${up ? 'Up' : 'Down'} ${text}`}
    >
      {flat ? <Text className={`${fg} ${size === 'lg' ? 'text-[13px]' : 'text-[10px]'} font-bold`}>— </Text> : <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={size === 'lg' ? 14 : 10} color={color} />}
      <Text className={`ml-0.5 font-bold ${fg} ${size === 'lg' ? 'text-[15px]' : 'text-[10px]'}`}>{text}</Text>
    </View>
  );
}

/** Compact select control ("Last 30 days ˅", "Views ˅") that opens a sheet of options. */
export function SelectButton<T extends string>({
  value,
  options,
  onChange,
  title,
  accessibilityLabel,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  title: string;
  accessibilityLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}: ${current}`}
        className="h-10 flex-row items-center rounded-xl border border-neutral-200 bg-white px-md active:bg-neutral-50"
      >
        <Text className="text-[13px] font-medium text-navy">{current}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.navy} style={{ marginLeft: 8 }} />
      </Pressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={title}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                setOpen(false);
                onChange(option.value);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="min-h-12 flex-row items-center justify-between border-b border-neutral-100 active:bg-neutral-50"
            >
              <Text className={`text-body ${selected ? 'font-semibold text-primary' : 'text-navy'}`}>{option.label}</Text>
              {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
      </BottomSheet>
    </>
  );
}

/** Small provenance label: Measured · Analysis · AI insight · Suggestion. */
export function Provenance({ kind }: { kind: 'measured' | 'analysis' | 'ai' | 'suggestion' }) {
  const s = {
    measured: { label: 'Measured', bg: 'bg-success-light', fg: 'text-success' },
    analysis: { label: 'Analysis', bg: 'bg-sky', fg: 'text-primary' },
    ai: { label: 'AI insight', bg: 'bg-violet-light', fg: 'text-violet' },
    suggestion: { label: 'Suggestion', bg: 'bg-warning-light', fg: 'text-warning' },
  }[kind];
  return (
    <View className={`self-start rounded px-1.5 py-0.5 ${s.bg}`}>
      <Text className={`text-[10px] font-semibold ${s.fg}`}>{s.label}</Text>
    </View>
  );
}

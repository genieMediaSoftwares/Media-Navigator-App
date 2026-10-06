import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { formatCompactNumber, formatPercent, formatSignedPercent, NOT_AVAILABLE } from '@/lib/format';
import { Confidence } from '@/types/analysis';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** 0–100 performance score. Color steps are paired with the number, so meaning never depends on color. */
export function ScoreBadge({ score, size = 'md' }: { score: number | null; size?: 'sm' | 'md' | 'lg' }) {
  const tone = score === null ? 'neutral' : score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low';
  const bg = { high: 'bg-success-light', mid: 'bg-sky', low: 'bg-warning-light', neutral: 'bg-neutral-100' }[tone];
  const fg = { high: 'text-success', mid: 'text-primary', low: 'text-warning', neutral: 'text-neutral-500' }[tone];
  const dim = size === 'lg' ? 'h-16 w-16' : size === 'sm' ? 'h-9 w-9' : 'h-12 w-12';
  const text = size === 'lg' ? 'text-heading' : size === 'sm' ? 'text-label font-bold' : 'text-title font-bold';
  return (
    <View className={`items-center justify-center rounded-full ${bg} ${dim}`} accessible accessibilityLabel={score === null ? 'Performance score not available' : `Performance score ${score} out of 100`}>
      <Text className={`${fg} ${text}`}>{score === null ? '–' : score}</Text>
    </View>
  );
}

/** Uppercase section label used across analysis screens. */
export function SectionLabel({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View className="mb-md flex-row items-center justify-between">
      <Text className="text-caption font-semibold uppercase tracking-wide text-neutral-500" accessibilityRole="header">
        {children}
      </Text>
      {right}
    </View>
  );
}

/** One labelled number in a grid cell; null renders "Not available" (never 0). */
export function MetricCell({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return (
    <View className="mb-lg w-1/2 pr-md" accessible accessibilityLabel={`${label}: ${value ?? NOT_AVAILABLE}${hint ? `, ${hint}` : ''}`}>
      <Text className="text-caption text-neutral-500" numberOfLines={1}>
        {label}
      </Text>
      <Text className={value === null ? 'mt-1 text-label text-neutral-400' : 'mt-0.5 text-title font-bold text-navy'} numberOfLines={1}>
        {value ?? NOT_AVAILABLE}
      </Text>
      {hint ? (
        <Text className="text-caption text-neutral-400" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export const num = (value: number | null | undefined) => (value === null || value === undefined ? null : formatCompactNumber(value));
export const pctOrNull = (value: number | null | undefined, digits = 2) => (value === null || value === undefined ? null : formatPercent(value, digits));

/** "+34%" / "−42%" chip for a difference from a reference value. */
export function DiffChip({ percent, label }: { percent: number | null; label?: string }) {
  if (percent === null) return null;
  const up = percent >= 0;
  return (
    <View className={`flex-row items-center self-start rounded-full px-sm py-0.5 ${up ? 'bg-success-light' : 'bg-warning-light'}`}>
      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={11} color={up ? colors.success : colors.warning} />
      <Text className={`ml-0.5 text-caption font-semibold ${up ? 'text-success' : 'text-warning'}`}>
        {formatSignedPercent(percent)}
        {label ? ` ${label}` : ''}
      </Text>
    </View>
  );
}

const CONFIDENCE: Record<Confidence, { label: string; dots: number }> = {
  high: { label: 'High confidence', dots: 3 },
  medium: { label: 'Medium confidence', dots: 2 },
  low: { label: 'Low confidence', dots: 1 },
};

export function ConfidenceMeter({ confidence, onDark = false }: { confidence: Confidence; onDark?: boolean }) {
  const c = CONFIDENCE[confidence];
  return (
    <View className="flex-row items-center" accessible accessibilityLabel={c.label}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          className="mr-1 h-2 w-4 rounded-full"
          style={{ backgroundColor: i <= c.dots ? (onDark ? colors.white : colors.primary) : onDark ? colors.onDarkSubtle : colors.neutral200 }}
        />
      ))}
      <Text className="ml-xs text-caption" style={{ color: onDark ? colors.onDarkMuted : colors.neutral500 }}>
        {c.label}
      </Text>
    </View>
  );
}

/** Provenance tag for analysis text. Measured data and AI output are never shown under the same tag. */
export function SourceTag({ kind }: { kind: 'measured' | 'rule' | 'ai' }) {
  const tag = {
    measured: { label: 'Measured data', icon: 'analytics-outline' as IconName, bg: 'bg-success-light', fg: 'text-success', color: colors.success },
    rule: { label: 'Suggestion from your data', icon: 'git-branch-outline' as IconName, bg: 'bg-neutral-100', fg: 'text-navy-light', color: colors.navyLight },
    ai: { label: 'AI interpretation', icon: 'sparkles-outline' as IconName, bg: 'bg-violet-light', fg: 'text-violet', color: colors.violet },
  }[kind];
  return (
    <View className={`flex-row items-center self-start rounded-sm px-sm py-0.5 ${tag.bg}`}>
      <Ionicons name={tag.icon} size={12} color={tag.color} />
      <Text className={`ml-xs text-caption font-semibold ${tag.fg}`}>{tag.label}</Text>
    </View>
  );
}

/** Numbered list item. */
export function NumberedItem({ index, title, detail, tone = 'neutral' }: { index: number; title: string; detail?: string; tone?: 'positive' | 'negative' | 'neutral' | 'ai' }) {
  const bg = { positive: 'bg-success-light', negative: 'bg-warning-light', neutral: 'bg-neutral-100', ai: 'bg-violet-light' }[tone];
  const fg = { positive: 'text-success', negative: 'text-warning', neutral: 'text-navy', ai: 'text-violet' }[tone];
  return (
    <View className="mb-md flex-row">
      <View className={`mr-md mt-0.5 h-6 w-6 items-center justify-center rounded-full ${bg}`}>
        <Text className={`text-caption font-bold ${fg}`}>{index}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-body text-navy">{title}</Text>
        {detail ? <Text className="mt-0.5 text-label font-normal text-neutral-500">{detail}</Text> : null}
      </View>
    </View>
  );
}

/** Text link with chevron. */
export function LinkButton({ label, onPress, icon }: { label: string; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6} className="min-h-11 flex-row items-center self-start">
      {icon ? <Ionicons name={icon} size={16} color={colors.primary} style={{ marginRight: 6 }} /> : null}
      <Text className="text-label font-semibold text-primary">{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.primary} />
    </Pressable>
  );
}

/** Small outlined action used on cards ("Why it's top", "Deep video analysis"). */
export function ChipButton({ label, icon, onPress, accent = false }: { label: string; icon: IconName; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`mr-sm mt-sm min-h-10 flex-row items-center rounded-full border px-md ${accent ? 'border-violet-border bg-violet-light' : 'border-neutral-200 bg-white'} active:opacity-70`}
    >
      <Ionicons name={icon} size={15} color={accent ? colors.violet : colors.navy} />
      <Text className={`ml-xs text-label font-semibold ${accent ? 'text-violet' : 'text-navy'}`}>{label}</Text>
    </Pressable>
  );
}

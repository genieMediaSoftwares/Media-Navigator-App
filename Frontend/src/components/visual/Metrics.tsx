import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps, useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors } from '@/constants/colors';
import { NOT_AVAILABLE } from '@/lib/format';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface StripMetric {
  label: string;
  /** Formatted value; null renders "Not available". */
  value: string | null;
  accent?: string;
}

/**
 * A row of typographic metrics divided by hairlines, like a social profile's stats line. It
 * replaces grids of metric boxes. `tone="dark"` is for use on gradient hero surfaces.
 */
export function MetricStrip({ metrics, tone = 'light' }: { metrics: StripMetric[]; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <View className="flex-row">
      {metrics.map((metric, i) => (
        <View
          key={metric.label}
          className="flex-1 px-xs"
          style={i > 0 ? { borderLeftWidth: 1, borderLeftColor: dark ? colors.onDarkSubtle : colors.neutral200 } : undefined}
          accessible
          accessibilityLabel={`${metric.label}: ${metric.value ?? NOT_AVAILABLE}`}
        >
          <Text
            className={`text-center ${metric.value !== null ? 'text-title font-bold' : 'text-caption leading-6'}`}
            style={{ color: metric.value !== null ? (metric.accent ?? (dark ? colors.white : colors.navy)) : dark ? colors.onDarkMuted : colors.neutral400 }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {metric.value ?? NOT_AVAILABLE}
          </Text>
          <Text className="mt-0.5 text-center text-caption" style={{ color: dark ? colors.onDarkMuted : colors.neutral500 }} numberOfLines={1}>
            {metric.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Rounded inline metric: icon, value, label. Unavailable values say so instead of showing a number. */
export function MetricPill({ icon, label, value, tone = 'light' }: { icon: IconName; label: string; value: string | null; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <View
      className="mr-sm flex-row items-center rounded-full px-md py-sm"
      style={{ backgroundColor: dark ? colors.onDarkSubtle : colors.neutral100 }}
      accessible
      accessibilityLabel={`${label}: ${value ?? NOT_AVAILABLE}`}
    >
      <Ionicons name={icon} size={14} color={dark ? colors.white : colors.primary} />
      <Text className="ml-xs text-caption font-semibold" style={{ color: dark ? colors.white : value !== null ? colors.navy : colors.neutral400 }}>
        {value ?? 'Not available'}
      </Text>
      <Text className="ml-xs text-caption" style={{ color: dark ? colors.onDarkMuted : colors.neutral500 }}>
        {label}
      </Text>
    </View>
  );
}

// Animated views here take plain style objects only: combining NativeWind `className` with a Reanimated
// animated style on the same Animated.View left the animated size stuck at 0 (invisible bars).

/** Horizontal bar that grows to `ratio` (0–1) on mount. */
export function AnimatedBar({ ratio, color, height = 8, track = colors.neutral100 }: { ratio: number; color: string; height?: number; track?: string }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(Math.max(0, Math.min(1, ratio)) * 100, { duration: 600 });
  }, [ratio, width]);
  const style = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  return (
    <View className="overflow-hidden rounded-full" style={{ height, backgroundColor: track }}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, style]} />
    </View>
  );
}

/** Labelled comparison bar: label + value above an animated bar. */
export function PerformanceBar({ label, value, ratio, color, emphasis = false }: { label: string; value: string; ratio: number; color: string; emphasis?: boolean }) {
  return (
    <View className="mb-md" accessible accessibilityLabel={`${label}: ${value}`}>
      <View className="mb-xs flex-row justify-between">
        <Text className={`text-label ${emphasis ? 'font-semibold text-navy' : 'font-normal text-neutral-500'}`}>{label}</Text>
        <Text className={`text-label ${emphasis ? 'font-bold text-navy' : 'font-semibold text-neutral-500'}`}>{value}</Text>
      </View>
      <AnimatedBar ratio={ratio} color={color} height={emphasis ? 10 : 8} />
    </View>
  );
}

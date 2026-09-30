import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors } from '@/constants/colors';

interface SegmentedControlProps<T extends string> {
  segments: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** Native-feeling segmented control: a white thumb slides between segments on a soft track. */
export function SegmentedControl<T extends string>({ segments, value, onChange }: SegmentedControlProps<T>) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, segments.findIndex((s) => s.value === value));
  const segmentWidth = width > 0 ? (width - 8) / segments.length : 0;
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withTiming(index * segmentWidth, { duration: 220 });
  }, [index, segmentWidth, offset]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      className="flex-row rounded-full bg-neutral-100 p-xs"
      accessibilityRole="tablist"
    >
      {segmentWidth > 0 ? (
        <Animated.View
          style={[{ position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 999, backgroundColor: colors.white, width: segmentWidth, shadowColor: '#0B1F44', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }, thumbStyle]}
        />
      ) : null}
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            onPress={() => onChange(segment.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className="min-h-10 flex-1 items-center justify-center"
          >
            <Text className={`text-label ${selected ? 'font-semibold text-navy' : 'text-neutral-500'}`}>{segment.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

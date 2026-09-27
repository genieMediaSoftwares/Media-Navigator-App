import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';

/**
 * Neutral placeholder block shown while real content loads. It never contains text or numbers.
 * Pulses gently unless the user has enabled Reduce Motion.
 */
export function Skeleton({ className }: { className: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View style={{ opacity }} importantForAccessibility="no-hide-descendants">
      <View className={`rounded-md bg-neutral-100 ${className}`} />
    </Animated.View>
  );
}

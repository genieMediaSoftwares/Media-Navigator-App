import { ReactNode } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

// Motion primitives. Short, subtle and interruptible. Reanimated's layout animations follow the
// system Reduce Motion setting by default, so no animation is forced on users who opt out.

/** Registered with NativeWind in lib/nativewind-interop.ts so `className` works on it. */
export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
  /** How far the element shrinks while pressed. */
  scaleTo?: number;
}

/** Pressable with a gentle spring "press-in" instead of an opacity flash. */
export function PressableScale({ children, style, className, scaleTo = 0.97, onPressIn, onPressOut, ...props }: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...props}
      className={className}
      style={[style, animatedStyle]}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, { damping: 20, stiffness: 400 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 18, stiffness: 300 });
        onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Section entrance: a short fade-and-rise, staggered by `index`. */
export function FadeIn({ children, index = 0, className }: { children: ReactNode; index?: number; className?: string }) {
  return (
    <Animated.View entering={FadeInDown.duration(320).delay(Math.min(index, 8) * 50)} className={className}>
      {children}
    </Animated.View>
  );
}

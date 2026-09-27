import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';

import { GradientName, gradients } from '@/constants/colors';

interface GradientProps {
  name: GradientName;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Diagonal by default; `vertical` for scrims over media. */
  direction?: 'diagonal' | 'vertical' | 'horizontal';
}

const DIRECTIONS = {
  diagonal: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  vertical: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
  horizontal: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
} as const;

/** A preset gradient from constants/colors.ts. Third-party view, so it is styled with `style`. */
export function Gradient({ name, children, style, direction = 'diagonal' }: GradientProps) {
  return (
    <LinearGradient colors={gradients[name]} {...DIRECTIONS[direction]} style={style}>
      {children}
    </LinearGradient>
  );
}

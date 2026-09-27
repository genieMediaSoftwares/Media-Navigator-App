import { cssInterop } from 'nativewind';
import Animated from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/visual/Motion';

// NativeWind only converts `className` → `style` for components it knows about (React Native core).
// Reanimated components must be registered, otherwise their className is silently ignored.
// Imported once from the root layout.
cssInterop(Animated.View, { className: 'style' });
cssInterop(AnimatedPressable, { className: 'style' });

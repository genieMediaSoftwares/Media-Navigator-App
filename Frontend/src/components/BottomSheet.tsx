import { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';
import { elevation, radius } from '@/constants/theme';

import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  closeLabel?: string;
}

/**
 * Modal sheet anchored to the bottom of the screen. The backdrop fades, the sheet slides up.
 * Closes via the close button, the backdrop, or the Android back button.
 */
export function BottomSheet({ visible, onClose, title, children, closeLabel = 'Close' }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.backdrop }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <Animated.View
          entering={SlideInDown.duration(260)}
          accessibilityViewIsModal
          style={[
            {
              maxHeight: height * 0.88,
              paddingBottom: Math.max(insets.bottom, 16),
              backgroundColor: colors.white,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
            },
            elevation.sheet,
          ]}
        >
          <View className="items-center pt-sm">
            <View className="h-1 w-10 rounded-full bg-neutral-300" />
          </View>
          <View className="flex-row items-center px-xl pb-sm pt-md">
            <Text className="flex-1 text-heading text-navy" accessibilityRole="header">
              {title}
            </Text>
            <IconButton icon="close" accessibilityLabel="Close" onPress={onClose} variant="tinted" />
          </View>
          <ScrollView contentContainerClassName="px-xl pb-lg" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          <View className="px-xl pt-sm">
            <Button title={closeLabel} variant="secondary" onPress={onClose} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

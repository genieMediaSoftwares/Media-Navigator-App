import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { SocialPlatform } from '@/types/api';
import { BLUEPRINTS } from '../blueprint';

interface PlatformSelectorProps {
  selectedPlatform: SocialPlatform;
  onSelectPlatform: (platform: SocialPlatform) => void;
}

const ALL_PLATFORMS: SocialPlatform[] = ['instagram', 'facebook', 'youtube', 'linkedin'];

export function PlatformSelector({ selectedPlatform, onSelectPlatform }: PlatformSelectorProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-md" contentContainerClassName="px-xs">
      {ALL_PLATFORMS.map((pId) => {
        const bp = BLUEPRINTS[pId];
        const selected = pId === selectedPlatform;
        return (
          <Pressable
            key={pId}
            onPress={() => onSelectPlatform(pId)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={`mr-sm flex-row items-center rounded-full px-lg py-sm ${
              selected ? 'bg-navy' : 'bg-neutral-100'
            }`}
          >
            <Ionicons name={bp.icon} size={16} color={selected ? colors.white : bp.accent} />
            <Text className={`ml-xs text-label ${selected ? 'font-semibold text-white' : 'text-navy'}`}>
              {bp.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { colors } from '@/constants/colors';
import { ContentFormat } from '@/types/api';

import { FORMAT_LABELS } from '../labels';

interface MediaThumbProps {
  uri: string | null;
  format: ContentFormat;
  /** Square size in dp. Omit to fill the parent (give the parent a size). */
  size?: number;
  rounded?: 'md' | 'lg' | 'xl' | 'none';
}

const ROUNDED = { none: '', md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl' } as const;

/**
 * Instagram preview image via expo-image (memory + disk cache, recycled in lists). Instagram CDN
 * URLs expire, so a failed load falls back to the format icon on the format's tint.
 */
export function MediaThumb({ uri, format, size, rounded = 'md' }: MediaThumbProps) {
  const [failed, setFailed] = useState(false);
  const label = FORMAT_LABELS[format];
  const dimension = size !== undefined ? { width: size, height: size } : { width: '100%' as const, height: '100%' as const };

  return (
    <View
      style={[dimension, { backgroundColor: label.light }]}
      className={`items-center justify-center overflow-hidden ${ROUNDED[rounded]}`}
      importantForAccessibility="no-hide-descendants"
    >
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={uri}
          transition={150}
          onError={() => setFailed(true)}
        />
      ) : (
        <Ionicons name={label.icon} size={Math.min((size ?? 96) * 0.36, 40)} color={label.color} />
      )}
      {!uri || failed ? null : format === 'REEL' || format === 'VIDEO' ? (
        <View className="absolute right-xs top-xs h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: colors.backdrop }}>
          <Ionicons name="play" size={11} color={colors.white} />
        </View>
      ) : null}
    </View>
  );
}

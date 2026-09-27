import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';

import { Gradient } from '@/components/visual/Gradient';
import { Overline } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { formatDate } from '@/lib/format';
import { HeroSignal, SignalTone } from '@/types/api';

const TONES: Record<SignalTone, { label: string; icon: 'trending-up' | 'pulse-outline' | 'warning-outline' }> = {
  positive: { label: 'Positive signal', icon: 'trending-up' },
  neutral: { label: 'Signal', icon: 'pulse-outline' },
  attention: { label: 'Needs attention', icon: 'warning-outline' },
};

/** The single most important signal from the backend, shown at the top of Home (only when the API sends one). */
export function HeroSignalBanner({ signal }: { signal: HeroSignal }) {
  const tone = TONES[signal.tone];
  return (
    <View className="mb-xl">
      <Gradient name="ai" style={{ borderRadius: 24, padding: 1.5 }}>
        <Gradient name="aiSoft" style={{ borderRadius: 23, padding: 20 }}>
          <View className="flex-row items-center">
            <Ionicons name={tone.icon} size={14} color={colors.violet} />
            <Overline color={colors.violet} className="ml-xs">
              {tone.label}
            </Overline>
          </View>
          <Text className="mt-md text-heading text-navy">{signal.title}</Text>
          <Text className="mt-sm text-body text-navy-light">{signal.summary}</Text>
          <Text className="mt-lg text-caption text-neutral-500">Updated {formatDate(signal.generatedAt)}</Text>
        </Gradient>
      </Gradient>
    </View>
  );
}

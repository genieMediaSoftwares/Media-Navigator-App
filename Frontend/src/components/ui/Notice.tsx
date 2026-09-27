import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';

import { noticeVariants } from '@/constants/variants';

interface NoticeProps {
  variant: keyof typeof noticeVariants;
  title?: string;
  message: string;
}

/** Inline message. The icon and title carry meaning, so state is never conveyed by color alone. */
export function Notice({ variant, title, message }: NoticeProps) {
  const styles = noticeVariants[variant];
  return (
    <View
      accessibilityRole={variant === 'error' ? 'alert' : 'summary'}
      accessibilityLiveRegion="polite"
      className={`mb-lg flex-row rounded-lg border p-lg ${styles.container}`}
    >
      <Ionicons name={styles.icon} size={20} color={styles.color} />
      <View className="ml-md flex-1">
        {title ? <Text className={`mb-xs text-label font-semibold ${styles.text}`}>{title}</Text> : null}
        <Text className={`text-label font-normal ${variant === 'info' ? 'text-navy-light' : styles.text}`}>{message}</Text>
      </View>
    </View>
  );
}

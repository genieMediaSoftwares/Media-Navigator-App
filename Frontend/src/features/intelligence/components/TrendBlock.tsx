import { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { EvidenceKind, EvidenceTag } from './Evidence';

/** One finding: where it comes from (observed / AI), a short headline, a line of detail and one way in. */
export function TrendBlock({
  eyebrow,
  kind,
  title,
  body,
  action,
  children,
}: {
  eyebrow: string;
  kind: EvidenceKind;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  children?: ReactNode;
}) {
  return (
    <View className="mb-xl rounded-2xl bg-neutral-50 p-lg">
      <View className="mb-sm flex-row flex-wrap items-center justify-between">
        <Text className="mr-sm text-overline uppercase tracking-widest text-neutral-500">{eyebrow}</Text>
        <EvidenceTag kind={kind} />
      </View>
      <Text className="text-title text-navy">{title}</Text>
      {body ? <Text className="mt-xs text-label font-normal text-neutral-500">{body}</Text> : null}
      {children}
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" className="mt-sm min-h-11 justify-center self-start">
          <Text className="text-label font-semibold text-primary">{action.label} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

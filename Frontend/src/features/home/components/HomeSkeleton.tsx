import { View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';

/** Mirrors the Home layout (channel hero, shortcuts, numbers) while the overview loads. */
export function HomeSkeleton() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading account data">
      <Skeleton className="mb-2xl h-60 w-full rounded-3xl" />
      <Skeleton className="mb-md h-3 w-20" />
      <View className="mb-2xl flex-row">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="mr-md h-16 w-16 rounded-3xl" />
        ))}
      </View>
      <Skeleton className="mb-md h-6 w-40" />
      <Skeleton className="h-12 w-full" />
    </View>
  );
}

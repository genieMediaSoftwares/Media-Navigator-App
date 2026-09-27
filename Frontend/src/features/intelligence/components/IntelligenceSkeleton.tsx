import { View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';

/** Placeholder rows shaped like media list rows. Contains no text or numbers. */
export function RowsSkeleton({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} className="flex-row py-md">
          <Skeleton className="h-16 w-16 rounded-xl" />
          <View className="ml-md flex-1 justify-center">
            <Skeleton className="mb-sm h-3 w-20" />
            <Skeleton className="mb-sm h-4 w-full" />
            <Skeleton className="h-3 w-40" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Mirrors the Intelligence home: account row, hero, AI callout, then a media rail. */
export function IntelligenceSkeleton() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading intelligence">
      <View className="mb-xl flex-row items-center">
        <Skeleton className="h-11 w-11 rounded-full" />
        <View className="ml-md">
          <Skeleton className="mb-xs h-4 w-36" />
          <Skeleton className="h-3 w-52" />
        </View>
      </View>
      <Skeleton className="mb-2xl h-64 w-full rounded-3xl" />
      <Skeleton className="mb-md h-3 w-24" />
      <Skeleton className="mb-lg h-6 w-40" />
      <Skeleton className="mb-2xl h-48 w-full rounded-3xl" />
      <View className="flex-row">
        <Skeleton className="mr-md h-72 w-56 rounded-3xl" />
        <Skeleton className="h-72 w-20 rounded-3xl" />
      </View>
    </View>
  );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Gradient } from '@/components/visual/Gradient';
import { AnimatedBar } from '@/components/visual/Metrics';
import { PressableScale } from '@/components/visual/Motion';
import { Overline, SectionTitle } from '@/components/visual/Typography';
import { colors } from '@/constants/colors';
import { fetchPlannerInsights } from '@/features/planner/api';
import { useApiResource } from '@/hooks/useApiResource';
import { DAY_NAMES, formatCompactNumber, formatDate, formatHourRange, formatPercent } from '@/lib/format';
import { IntelligenceOverview, IntelligencePost } from '@/types/api';

import { SUGGESTED_QUESTIONS } from '../labels';
import { MediaThumb } from './MediaThumb';
import { WeekPattern } from './WeekPattern';

/** Measured weekly pattern, or progress toward having enough history. Never a guessed time. */
export function TimingSection({ timing, onOpenPlanner }: { timing: IntelligenceOverview['timing']; onOpenPlanner: () => void }) {
  return (
    <View className="mb-2xl">
      <SectionTitle
        eyebrow="Timing patterns"
        eyebrowIcon="time-outline"
        eyebrowColor={colors.cyan}
        title={timing.sufficient ? 'When your content lands' : 'Timing'}
        action={timing.sufficient ? { label: 'Planner', onPress: onOpenPlanner } : undefined}
      />
      {timing.sufficient ? (
        <TimingChart timing={timing} />
      ) : (
        <View>
          <Text className="text-title text-navy">More publishing history needed</Text>
          <Text className="mt-xs text-label font-normal text-neutral-500">
            Timing patterns appear after {timing.minimumRequired} posts with engagement data. {timing.postsAnalyzed} analyzed so far.
          </Text>
          <View className="mt-md">
            <AnimatedBar ratio={timing.minimumRequired > 0 ? timing.postsAnalyzed / timing.minimumRequired : 0} color={colors.cyan} />
          </View>
        </View>
      )}
    </View>
  );
}

function TimingChart({ timing }: { timing: IntelligenceOverview['timing'] }) {
  const { state } = useApiResource(fetchPlannerInsights);
  const window = timing.strongestWindow;
  return (
    <View>
      {state.status === 'success' && state.data.heatmap.length > 0 ? (
        <WeekPattern cells={state.data.heatmap} />
      ) : state.status === 'loading' ? (
        <Skeleton className="h-36 w-full rounded-2xl" />
      ) : null}
      {window ? (
        <View className="mt-lg flex-row items-center rounded-2xl bg-cyan-light px-lg py-md" accessible>
          <Ionicons name="flash" size={18} color={colors.cyan} />
          <View className="ml-md flex-1">
            <Text className="text-label font-semibold text-navy">
              Strongest window: {DAY_NAMES[window.dayOfWeek]}, {formatHourRange(window.startHour, window.endHour)}
            </Text>
            <Text className="text-caption text-neutral-500">
              Measured: {formatCompactNumber(window.avgInteractions)} avg interactions across {window.postCount} posts · {timing.timezone}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Assistant entry: a soft AI band with a search-like prompt and real-question suggestions. */
export function AskBand({ aiConfigured, onAsk }: { aiConfigured: boolean; onAsk: (question?: string) => void }) {
  return (
    <Gradient name="aiSoft" style={{ marginHorizontal: -24, paddingHorizontal: 24, paddingVertical: 28, marginBottom: 32 }}>
      <Overline icon="sparkles" color={colors.violet}>
        Ask Media Navigator
      </Overline>
      <Text className="mt-sm text-display text-navy">Ask anything about your content</Text>
      <PressableScale
        onPress={() => onAsk()}
        accessibilityRole="button"
        accessibilityLabel="Ask something about your Instagram performance"
        className="mt-lg min-h-14 flex-row items-center rounded-full bg-white px-lg"
        style={{ shadowColor: colors.violet, shadowOpacity: 0.15, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 }}
      >
        <Ionicons name="sparkles" size={18} color={colors.violet} />
        <Text className="ml-sm flex-1 text-body text-neutral-500">{aiConfigured ? 'Which content performs best?' : 'AI analysis is temporarily unavailable'}</Text>
        <Gradient name="ai" style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-up" size={18} color={colors.white} />
        </Gradient>
      </PressableScale>
      {aiConfigured ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-xl mt-lg" contentContainerClassName="px-xl">
          {[SUGGESTED_QUESTIONS[3], SUGGESTED_QUESTIONS[5], SUGGESTED_QUESTIONS[6], SUGGESTED_QUESTIONS[2]].map((question) => (
            <Pressable
              key={question}
              onPress={() => onAsk(question)}
              accessibilityRole="button"
              accessibilityLabel={`Ask: ${question}`}
              className="mr-sm min-h-11 justify-center rounded-full border border-violet-border bg-white/70 px-lg active:bg-white"
            >
              <Text className="text-label text-navy">{question}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </Gradient>
  );
}

/** Full-history editorial block: a mosaic of real recent media, the archive size and one way in. */
export function ArchiveSection({ archive, recent, onOpen }: { archive: IntelligenceOverview['archive']; recent: IntelligencePost[] | null; onOpen: () => void }) {
  const partial = archive.profileMediaCount !== null && archive.profileMediaCount > archive.syncedCount;
  const mosaic = (recent ?? []).slice(0, 4);

  return (
    <View className="mb-xl">
      <SectionTitle eyebrow="Archive" eyebrowIcon="albums-outline" title="Your content history" />
      <View className="flex-row items-center">
        <View className="flex-1" accessible>
          <Text className="text-hero text-navy">{archive.syncedCount.toLocaleString()}</Text>
          <Text className="text-label font-normal text-neutral-500">
            {partial ? `most recent of ${archive.profileMediaCount?.toLocaleString()} on Instagram` : 'posts synced'}
          </Text>
          {archive.oldestPublishedAt ? <Text className="mt-xs text-caption text-neutral-400">since {formatDate(archive.oldestPublishedAt)}</Text> : null}
        </View>
        {mosaic.length === 4 ? (
          <View className="flex-row flex-wrap" style={{ width: 112, gap: 4 }} importantForAccessibility="no-hide-descendants">
            {mosaic.map((post, i) => (
              <View key={post.id} style={{ transform: [{ rotate: i % 2 === 0 ? '-3deg' : '3deg' }] }}>
                <MediaThumb uri={post.previewUrl} format={post.format} size={54} rounded="lg" />
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View className="mt-lg">
        <Text className="text-caption text-neutral-500">
          {archive.totalViews !== null ? `${formatCompactNumber(archive.totalViews)} views across ${archive.viewsAvailableCount} posts with view data` : 'Views not available for synced media'}
        </Text>
        <Text className="mt-xs text-caption text-neutral-500">
          {archive.totalInteractions !== null ? `${formatCompactNumber(archive.totalInteractions)} total interactions` : 'Interactions not available'}
          {archive.avgEngagementRate !== null ? ` · ${formatPercent(archive.avgEngagementRate, 2)} avg engagement` : ''}
        </Text>
      </View>
      <View className="mt-lg">
        <Button title="Explore content library" icon="grid-outline" onPress={onOpen} />
      </View>
    </View>
  );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { formatCompactNumber, formatPercent } from '@/lib/format';
import { SupportingData } from '@/types/api';

import { FORMAT_LABELS } from '../labels';
import { MediaRow } from './MediaRow';

// Trust labels. Every block of intelligence text says where it came from, so an AI hypothesis
// is never presented as a measured fact. Meaning is carried by icon + text, not color alone.

export type EvidenceKind = 'observed' | 'aiSummary' | 'aiHypothesis' | 'aiSuggestion';

const TAGS: Record<EvidenceKind, { label: string; icon: 'analytics-outline' | 'sparkles-outline' | 'bulb-outline' | 'flask-outline'; container: string; text: string; color: string }> = {
  observed: { label: 'Observed data', icon: 'analytics-outline', container: 'bg-success-light', text: 'text-success', color: colors.success },
  aiSummary: { label: 'AI summary of your data', icon: 'sparkles-outline', container: 'bg-sky', text: 'text-primary', color: colors.primary },
  aiHypothesis: { label: 'AI hypothesis · not verified', icon: 'bulb-outline', container: 'bg-warning-light', text: 'text-warning', color: colors.warning },
  aiSuggestion: { label: 'AI suggestion', icon: 'flask-outline', container: 'bg-sky', text: 'text-primary', color: colors.primary },
};

export function EvidenceTag({ kind }: { kind: EvidenceKind }) {
  const tag = TAGS[kind];
  return (
    <View className={`flex-row items-center self-start rounded-sm px-sm py-0.5 ${tag.container}`}>
      <Ionicons name={tag.icon} size={12} color={tag.color} />
      <Text className={`ml-xs text-caption font-semibold ${tag.text}`}>{tag.label}</Text>
    </View>
  );
}

const RAIL: Record<EvidenceKind, string> = {
  observed: colors.success,
  aiSummary: colors.primaryBright,
  aiHypothesis: colors.warning,
  aiSuggestion: colors.violet,
};

/**
 * A titled block of explanation with its provenance: a colored rail on the left (green = measured,
 * amber = hypothesis, blue/violet = AI summary/suggestion) plus the text tag, so provenance is
 * never conveyed by color alone.
 */
export function EvidenceBlock({ title, kind, children }: { title: string; kind: EvidenceKind; children: ReactNode }) {
  return (
    <View className="mb-xl flex-row">
      <View className="mr-lg w-1 rounded-full" style={{ backgroundColor: RAIL[kind] }} />
      <View className="flex-1">
        <EvidenceTag kind={kind} />
        <Text className="mb-xs mt-sm text-title text-navy" accessibilityRole="header">
          {title}
        </Text>
        {typeof children === 'string' ? <Text className="text-body text-navy-light">{children}</Text> : children}
      </View>
    </View>
  );
}

/** Numbers rebuilt by the server from synced data for the posts / formats the AI cited. */
export function SupportingDataList({ data, accountId }: { data: SupportingData; accountId: string | null }) {
  const router = useRouter();
  if (data.posts.length === 0 && data.formats.length === 0) {
    return <Text className="text-body text-neutral-500">No specific posts or formats were cited for this.</Text>;
  }
  return (
    <View>
      {data.formats.map((format) => (
        <View key={format.format} className="border-b border-neutral-100 py-md" accessible>
          <Text className="text-label font-semibold text-navy">
            {FORMAT_LABELS[format.format].plural} · {format.count} items
          </Text>
          <Text className="mt-xs text-caption text-neutral-500">
            {formatCompactNumber(format.avgInteractions)} avg interactions ·{' '}
            {format.avgViews !== null ? `${formatCompactNumber(format.avgViews)} avg views (${format.viewsSampleSize} with data)` : 'views not available'} ·{' '}
            {format.avgEngagementRate !== null ? `${formatPercent(format.avgEngagementRate, 2)} eng.` : 'engagement not available'}
          </Text>
        </View>
      ))}
      {data.posts.map((post) => (
        <MediaRow
          key={post.id}
          post={{
            id: post.id,
            format: post.format,
            caption: post.caption,
            permalink: null,
            previewUrl: post.previewUrl,
            publishedAt: post.publishedAt,
            metrics: { views: post.views, likes: post.likes, comments: post.comments, reach: null, saves: null, shares: null, totalInteractions: null },
            interactions: null,
            engagementRate: post.engagementRate,
            vsBaselinePercent: post.vsBaselinePercent,
          }}
          onPress={() => router.push({ pathname: '/intelligence/post/[id]', params: { id: post.id, accountId: accountId ?? '' } })}
        />
      ))}
    </View>
  );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { TextField } from '@/components/ui/TextField';
import { SocialPlatform } from '@/types/api';
import { blueprintOf, contentType, formatMetric } from '../blueprint';
import { getFixtureAccount } from '../fixtures';
import { PlatformHeader } from './PlatformHeader';

interface PlatformContentLibraryViewProps {
  platform: SocialPlatform;
  onSelectPlatform?: (platform: SocialPlatform) => void;
}

export function PlatformContentLibraryView({ platform, onSelectPlatform }: PlatformContentLibraryViewProps) {
  const router = useRouter();
  const bp = blueprintOf(platform);
  const fix = getFixtureAccount(platform);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);

  const posts = fix.posts.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesQ = !q || p.title.toLowerCase().includes(q) || p.caption.toLowerCase().includes(q);
    const matchesFormat = !selectedFormat || p.contentTypeId === selectedFormat;
    return matchesQ && matchesFormat;
  });

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-xl pb-3xl pt-md">
      <PlatformHeader
        platform={platform}
        handle={fix.handle}
        displayName={fix.displayName}
        profilePictureUrl={fix.profilePictureUrl}
        syncedPostsCount={fix.contentCount}
        onSelectPlatform={onSelectPlatform}
      />

      <Text className="text-heading text-navy">{bp.name} Content Library</Text>
      <Text className="mb-md mt-xs text-label font-normal text-neutral-500">
        All synced {bp.content.plural} for @{fix.handle}.
      </Text>

      {/* Search Bar */}
      <View className="mb-md">
        <TextField
          label="Search"
          placeholder={`Search ${bp.content.plural} by keyword…`}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
      </View>

      {/* Native Format Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-xl mb-lg" contentContainerClassName="px-xl">
        <Pressable
          onPress={() => setSelectedFormat(null)}
          className={`mr-sm flex-row items-center rounded-full px-lg py-sm ${
            selectedFormat === null ? 'bg-navy' : 'bg-neutral-100'
          }`}
        >
          <Text className={`text-label ${selectedFormat === null ? 'font-semibold text-white' : 'text-navy'}`}>All</Text>
        </Pressable>
        {bp.contentTypes.map((ct) => {
          const isSelected = ct.id === selectedFormat;
          return (
            <Pressable
              key={ct.id}
              onPress={() => setSelectedFormat(ct.id)}
              className={`mr-sm flex-row items-center rounded-full px-lg py-sm ${
                isSelected ? 'bg-navy' : 'bg-neutral-100'
              }`}
            >
              <View className="mr-xs h-2 w-2 rounded-full" style={{ backgroundColor: ct.color }} />
              <Text className={`text-label ${isSelected ? 'font-semibold text-white' : 'text-navy'}`}>{ct.plural}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Post List */}
      {posts.length === 0 ? (
        <View className="rounded-2xl bg-neutral-50 p-2xl items-center">
          <Ionicons name="search-outline" size={32} color="#94a3b8" />
          <Text className="mt-sm text-body text-neutral-500">No {bp.content.plural} match your query.</Text>
        </View>
      ) : (
        posts.map((post) => {
          const typeSpec = contentType(bp, post.contentTypeId);
          return (
            <Pressable
              key={post.id}
              onPress={() => router.push({ pathname: '/platforms/[platform]/detail' as any, params: { platform, id: post.id } })}
              className="mb-md rounded-2xl border border-neutral-200 bg-white p-lg active:bg-neutral-50"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center rounded-full px-md py-1" style={{ backgroundColor: typeSpec.light }}>
                  <Ionicons name={typeSpec.icon} size={14} color={typeSpec.color} />
                  <Text className="ml-xs text-caption font-bold" style={{ color: typeSpec.color }}>{typeSpec.singular}</Text>
                </View>
                <Text className={`text-caption font-bold ${post.vsBenchmarkPercent >= 0 ? 'text-success' : 'text-warning'}`}>
                  {post.vsBenchmarkPercent >= 0 ? `+${post.vsBenchmarkPercent}%` : `${post.vsBenchmarkPercent}%`}
                </Text>
              </View>

              <Text className="mt-md text-title text-navy">{post.title}</Text>
              <Text className="mt-xs text-body text-neutral-500" numberOfLines={2}>{post.caption}</Text>

              <View className="mt-md flex-row items-center justify-between border-t border-neutral-100 pt-md">
                {bp.cardMetrics.map((k) => {
                  const spec = bp.metrics.find((m) => m.key === k);
                  if (!spec) return null;
                  const val = post.metrics[k];
                  return (
                    <View key={k} className="items-center">
                      <Text className="text-caption text-neutral-400">{spec.label}</Text>
                      <Text className="text-label font-semibold text-navy">{formatMetric(val, spec.kind) ?? 'N/A'}</Text>
                    </View>
                  );
                })}
              </View>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

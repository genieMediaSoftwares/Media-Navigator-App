import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatLabel } from '@/features/intelligence/labels';
import { formatCompactNumber, formatPercent } from '@/lib/format';
import { PerformerItem, PerformersPage, PerformerType } from '@/types/analysis';
import { ContentFormat, SocialPlatform } from '@/types/api';

import { fetchPerformers } from '../api';
import { PerformerCard } from './PerformerCard';
import { ReasonsPanel } from './ReasonsPanel';

const PAGE = 10;

const COPY: Record<PerformerType, { title: string; subtitle: string; empty: string }> = {
  top: {
    title: 'Top performers',
    subtitle: 'Ranked by performance score: views, reach, likes, comments, shares, saves and engagement rate together, not likes alone.',
    empty: 'No scored posts yet.',
  },
  improve: {
    title: 'Needs improvement',
    subtitle: 'Your lowest-scoring posts older than 3 days, with what held them back and what to try next.',
    empty: 'No posts to improve yet.',
  },
};

interface PerformersSectionProps {
  accountId: string;
  platform: SocialPlatform;
  type: PerformerType;
  formats: ContentFormat[];
  /** Changes after each sync so the list reloads. */
  version: string | null;
}

export function PerformersSection({ accountId, platform, type, formats, version }: PerformersSectionProps) {
  const [format, setFormat] = useState<ContentFormat | null>(null);
  const copy = COPY[type];

  return (
    <View>
      <Text className="text-heading text-navy" accessibilityRole="header">
        {copy.title}
      </Text>
      <Text className="mb-lg mt-xs text-label font-normal text-neutral-500">{copy.subtitle}</Text>

      {formats.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-xl mb-lg" contentContainerClassName="px-xl">
          {[null, ...formats].map((option) => {
            const active = option === format;
            return (
              <Pressable
                key={option ?? 'all'}
                onPress={() => setFormat(option)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className={`mr-sm min-h-10 justify-center rounded-full px-lg ${active ? 'bg-navy' : 'bg-neutral-100'}`}
              >
                <Text className={`text-label ${active ? 'font-semibold text-white' : 'text-navy'}`}>{option ? formatLabel(option, platform).plural : 'All'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* A new format or a new sync remounts the list, so it starts from page one. */}
      <PerformersList key={`${format ?? 'all'}:${version ?? ''}`} accountId={accountId} platform={platform} type={type} format={format} />
    </View>
  );
}

function PerformersList({ accountId, platform, type, format }: { accountId: string; platform: SocialPlatform; type: PerformerType; format: ContentFormat | null }) {
  const router = useRouter();
  const [page, setPage] = useState<PerformersPage | null>(null);
  const [items, setItems] = useState<PerformerItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'more' | 'error'>('loading');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<PerformerItem | null>(null);
  const copy = COPY[type];

  const [attempt, setAttempt] = useState(0);

  const fetchPage = useCallback(
    (offset: number) =>
      fetchPerformers({ accountId, type, format, offset, limit: PAGE }).then(
        (result) => {
          setPage(result);
          setItems((prev) => (offset === 0 ? result.items : [...prev, ...result.items]));
          setStatus('ready');
        },
        (e: unknown) => {
          setError(e instanceof Error ? e.message : 'Could not load posts.');
          setStatus('error');
        },
      ),
    [accountId, type, format],
  );

  // First page (and retries). State is only set when the response arrives.
  useEffect(() => {
    void fetchPage(0);
  }, [fetchPage, attempt]);

  const retry = () => {
    setStatus('loading');
    setAttempt((n) => n + 1);
  };
  const loadMore = (offset: number) => {
    setStatus('more');
    void fetchPage(offset);
  };
  const openPost = (id: string) => router.push({ pathname: '/intelligence/post/[id]', params: { id, accountId } });
  const openVideo = (id: string) => router.push({ pathname: '/intelligence/video/[id]', params: { id, accountId } });

  return (
    <View>
      {status === 'loading' ? (
        <View accessibilityRole="progressbar" accessibilityLabel="Loading posts">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="mb-lg h-48 w-full rounded-xl" />
          ))}
        </View>
      ) : status === 'error' && items.length === 0 ? (
        <ErrorState message={error} onRetry={retry} />
      ) : page && !page.sufficient ? (
        <EmptyState icon="hourglass-outline" title="More content history needed" message={`Rankings appear once ${page.minimumRequired} posts have engagement data.`} />
      ) : items.length === 0 ? (
        <EmptyState icon="images-outline" title={copy.empty} message="Sync your account or choose another format." />
      ) : (
        <>
          {page ? (
            <Text className="mb-md text-caption text-neutral-500">
              {page.total.toLocaleString()} posts ranked · your typical post:{' '}
              {[
                page.typicalPost.views !== null ? `${formatCompactNumber(page.typicalPost.views)} views` : null,
                page.typicalPost.likes !== null ? `${formatCompactNumber(page.typicalPost.likes)} likes` : null,
                page.typicalPost.engagementRate !== null ? `${formatPercent(page.typicalPost.engagementRate, 2)} engagement` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          {items.map((item, i) => (
            <PerformerCard
              key={item.post.id}
              item={item}
              type={type}
              rank={i + 1}
              platform={platform}
              onOpen={() => openPost(item.post.id)}
              onWhy={() => setSelected(item)}
              onVideo={() => openVideo(item.post.id)}
            />
          ))}
          {page?.nextOffset !== null && page?.nextOffset !== undefined ? (
            <Button title={status === 'more' ? 'Loading…' : 'Show more'} variant="ghost" loading={status === 'more'} onPress={() => loadMore(page.nextOffset as number)} />
          ) : null}
        </>
      )}

      <BottomSheet visible={selected !== null} onClose={() => setSelected(null)} title={type === 'top' ? 'Why it’s top' : 'Why it needs improvement'}>
        {selected ? (
          <View>
            <ReasonsPanel
              accountId={accountId}
              postId={selected.post.id}
              kind={type}
              reasons={selected.reasons}
              improvements={selected.improvements}
              aiConfigured={page?.aiConfigured ?? false}
            />
            <Button
              title="Open full post analysis"
              variant="ghost"
              onPress={() => {
                const id = selected.post.id;
                setSelected(null);
                openPost(id);
              }}
            />
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

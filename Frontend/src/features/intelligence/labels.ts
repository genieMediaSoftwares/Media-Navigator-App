import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';

import { colors } from '@/constants/colors';
import { ContentFormat, InsightType, SocialPlatform } from '@/types/api';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface FormatLabel {
  singular: string;
  plural: string;
  icon: IconName;
  color: string;
  light: string;
}

/** Each format has one accent color, used consistently in bars, badges and legends. */
export const FORMAT_LABELS: Record<ContentFormat, FormatLabel> = {
  REEL: { singular: 'Reel', plural: 'Reels', icon: 'film-outline', color: colors.magenta, light: colors.magentaLight },
  POST: { singular: 'Post', plural: 'Posts', icon: 'image-outline', color: colors.primaryBright, light: colors.sky },
  CAROUSEL: { singular: 'Carousel', plural: 'Carousels', icon: 'albums-outline', color: colors.violet, light: colors.violetLight },
  VIDEO: { singular: 'Video', plural: 'Videos', icon: 'videocam-outline', color: colors.cyan, light: colors.cyanLight },
  STORY: { singular: 'Story', plural: 'Stories', icon: 'ellipse-outline', color: colors.warning, light: colors.warningLight },
  TEXT: { singular: 'Text post', plural: 'Text posts', icon: 'document-text-outline', color: colors.navyLight, light: colors.neutral100 },
  IMAGE: { singular: 'Image post', plural: 'Image posts', icon: 'image-outline', color: colors.primaryBright, light: colors.sky },
  LINK: { singular: 'Link post', plural: 'Link posts', icon: 'link-outline', color: colors.violet, light: colors.violetLight },
  LIVE: { singular: 'Live video', plural: 'Live videos', icon: 'radio-outline', color: colors.danger, light: colors.dangerLight },
  ARTICLE: { singular: 'Article', plural: 'Articles', icon: 'newspaper-outline', color: colors.success, light: colors.successLight },
  DOCUMENT: { singular: 'Document', plural: 'Documents', icon: 'document-attach-outline', color: colors.cyan, light: colors.cyanLight },
  POLL: { singular: 'Poll', plural: 'Polls', icon: 'stats-chart-outline', color: colors.warning, light: colors.warningLight },
};

/**
 * The format's name in the platform's own vocabulary: Instagram photos and carousels, Facebook
 * albums, LinkedIn multi-image posts, YouTube live streams. YouTube content is never called a Reel
 * (the server never classifies it as one).
 */
export function formatLabel(format: ContentFormat, platform: SocialPlatform | null | undefined): FormatLabel {
  const base = FORMAT_LABELS[format];
  if (format === 'POST' && platform === 'instagram') return { ...base, singular: 'Photo', plural: 'Photos' };
  if (format === 'CAROUSEL' && platform === 'facebook') return { ...base, singular: 'Album', plural: 'Albums' };
  if (format === 'CAROUSEL' && platform === 'linkedin') return { ...base, singular: 'Multi-image post', plural: 'Multi-image posts' };
  if (format === 'LIVE' && platform === 'youtube') return { ...base, singular: 'Live stream', plural: 'Live streams' };
  return base;
}

export const INSIGHT_LABELS: Record<InsightType, { label: string; icon: IconName }> = {
  pattern: { label: 'Pattern detected', icon: 'flame-outline' },
  growth: { label: 'Momentum signal', icon: 'trending-up-outline' },
  timing: { label: 'Timing signal', icon: 'time-outline' },
  format: { label: 'Format signal', icon: 'layers-outline' },
  risk: { label: 'Watch out', icon: 'alert-circle-outline' },
};

/** Suggested starting points for Ask Media Navigator. Answers always come from the server. */
export const SUGGESTED_QUESTIONS = [
  'Which format performs best?',
  'Why did my top Reel perform so well?',
  'Why are my recent posts performing lower?',
  'What should I create more of?',
  'What should I stop doing?',
] as const;

/** Actionable copy for server error codes the Intelligence screens can hit. */
export function describeIntelligenceError(
  code: string | undefined,
  fallback: string,
  platformName = 'Instagram',
): { title: string; message: string; reconnect: boolean } {
  switch (code) {
    case 'REAUTHORIZATION_REQUIRED':
    case 'INVALID_TOKEN':
      return { title: `${platformName} connection expired`, message: `Reconnect ${platformName} to keep your analytics up to date.`, reconnect: true };
    case 'SYNC_FAILED':
    case 'META_API_ERROR':
    case 'PLATFORM_API_ERROR':
      return { title: 'Sync failed', message: fallback, reconnect: false };
    case 'AI_UNAVAILABLE':
      return { title: 'AI analysis is temporarily unavailable', message: 'Your metrics are still up to date. Try again in a moment.', reconnect: false };
    case 'AI_RATE_LIMITED':
      return { title: 'AI limit reached', message: fallback, reconnect: false };
    case 'INSUFFICIENT_DATA':
      return { title: 'Not enough historical data yet', message: fallback, reconnect: false };
    case 'NETWORK_ERROR':
      return { title: 'You’re offline', message: fallback, reconnect: false };
    default:
      return { title: 'Something went wrong', message: fallback, reconnect: false };
  }
}

/** Display mirror of the server's classifyFormat(), for raw Meta fields from the account dashboard endpoint. */
export function classifyFormat(mediaType: string | null, mediaProductType: string | null): ContentFormat {
  if (mediaProductType === 'REELS') return 'REEL';
  if (mediaProductType === 'STORY') return 'STORY';
  if (mediaType === 'CAROUSEL_ALBUM') return 'CAROUSEL';
  if (mediaType === 'VIDEO') return 'VIDEO';
  return 'POST';
}

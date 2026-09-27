import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';

import { colors } from '@/constants/colors';
import { ContentFormat, InsightType } from '@/types/api';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Each format has one accent color, used consistently in bars, badges and legends. */
export const FORMAT_LABELS: Record<ContentFormat, { singular: string; plural: string; icon: IconName; color: string; light: string }> = {
  REEL: { singular: 'Reel', plural: 'Reels', icon: 'film-outline', color: colors.magenta, light: colors.magentaLight },
  POST: { singular: 'Post', plural: 'Posts', icon: 'image-outline', color: colors.primaryBright, light: colors.sky },
  CAROUSEL: { singular: 'Carousel', plural: 'Carousels', icon: 'albums-outline', color: colors.violet, light: colors.violetLight },
  VIDEO: { singular: 'Video', plural: 'Videos', icon: 'videocam-outline', color: colors.cyan, light: colors.cyanLight },
  STORY: { singular: 'Story', plural: 'Stories', icon: 'ellipse-outline', color: colors.warning, light: colors.warningLight },
};

export const INSIGHT_LABELS: Record<InsightType, { label: string; icon: IconName }> = {
  pattern: { label: 'Pattern detected', icon: 'flame-outline' },
  growth: { label: 'Momentum signal', icon: 'trending-up-outline' },
  timing: { label: 'Timing signal', icon: 'time-outline' },
  format: { label: 'Format signal', icon: 'layers-outline' },
  risk: { label: 'Watch out', icon: 'alert-circle-outline' },
};

/** Suggested starting points for Ask Media Navigator. Answers always come from the Worker. */
export const SUGGESTED_QUESTIONS = [
  'Which posts performed best?',
  'What content generated the most engagement?',
  'What patterns appear in my top posts?',
  'Which format performs best?',
  'Which posts are below my average?',
  'What should I post more often?',
  'When does my content perform best?',
] as const;

/** Actionable copy for Worker error codes the Intelligence screens can hit. */
export function describeIntelligenceError(code: string | undefined, fallback: string): { title: string; message: string; reconnect: boolean } {
  switch (code) {
    case 'REAUTHORIZATION_REQUIRED':
    case 'INVALID_TOKEN':
      return { title: 'Instagram connection expired', message: 'Reconnect Instagram to keep your analytics up to date.', reconnect: true };
    case 'SYNC_FAILED':
    case 'META_API_ERROR':
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

/** Display mirror of the Worker's classifyFormat(), for raw Meta fields from the account dashboard endpoint. */
export function classifyFormat(mediaType: string | null, mediaProductType: string | null): ContentFormat {
  if (mediaProductType === 'REELS') return 'REEL';
  if (mediaProductType === 'STORY') return 'STORY';
  if (mediaType === 'CAROUSEL_ALBUM') return 'CAROUSEL';
  if (mediaType === 'VIDEO') return 'VIDEO';
  return 'POST';
}

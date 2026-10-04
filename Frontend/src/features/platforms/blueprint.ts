import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';

import { colors } from '@/constants/colors';
import { SocialPlatform } from '@/types/api';

// Platform blueprints: how each platform names its content, which metrics it has, and how Media
// Navigator talks about it. This is product configuration (vocabulary and structure), not data —
// every number shown next to it must come from the platform's API.

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface ContentTypeSpec {
  id: string;
  /** Filter / badge label, e.g. "Shorts". */
  plural: string;
  /** Badge label, e.g. "Short". */
  singular: string;
  /** How the type reads inside a sentence, e.g. "document post", "Short". */
  noun: string;
  nounPlural: string;
  icon: IconName;
  color: string;
  light: string;
  /** Text-first types (LinkedIn text posts, polls) render without a media frame. */
  textFirst?: boolean;
}

export type MetricKind = 'count' | 'percent' | 'duration' | 'hours' | 'signed';

export interface MetricSpec {
  key: string;
  label: string;
  kind: MetricKind;
}

export interface PatternCategory {
  id: string;
  title: string;
  /** The question the pattern answers for this platform. */
  question: string;
  /** What the finding is built from — shown until real data exists. */
  source: string;
  icon: IconName;
}

export type Tier = 'top' | 'moderate' | 'low';

export interface PlatformBlueprint {
  id: SocialPlatform;
  name: string;
  icon: IconName;
  accent: string;
  /** "Page", "Channel", "Organization", "Account". */
  accountNoun: string;
  /** Title of the "choose which one" step after sign-in. */
  selectTitle: string;
  selectHint: string;
  audienceLabel: string;
  content: { singular: string; plural: string };
  contentTypes: ContentTypeSpec[];
  /** Every metric the platform can provide, in display order. */
  metrics: MetricSpec[];
  /** The three metrics a content card shows. */
  cardMetrics: string[];
  /** What content is compared on, in words. */
  benchmark: string;
  /** Metric used for the "how this compares" bars. */
  benchmarkMetric: string;
  connect: { requirement: string; access: string };
  /** The "what's happening" sentence shape, filled by real data later. */
  happeningTemplate: (typePlural: string) => string;
  /** Platform-specific question per tier, for one content type. */
  question: (tier: Tier, type: ContentTypeSpec) => string;
  patterns: PatternCategory[];
}

/** The same analysis structure on every platform; the section titles carry the tier's question. */
export const ANALYSIS_SECTIONS: Record<Tier, { title: string; kind: 'observed' | 'aiSummary' | 'aiHypothesis' | 'aiSuggestion'; placeholder: string }[]> = {
  top: [
    { title: 'Why this worked', kind: 'aiHypothesis', placeholder: 'The likely reasons this item did better than your similar content, each phrased as something to test.' },
    { title: 'What the data shows', kind: 'observed', placeholder: 'The measured numbers behind it, compared with your other items of the same type.' },
    { title: 'What patterns are present', kind: 'aiSummary', placeholder: 'Traits this item shares with your other top performers — topic, format, timing, presentation.' },
    { title: 'What to repeat', kind: 'aiSuggestion', placeholder: 'Two to four specific things to do again, drawn from your own history.' },
  ],
  moderate: [
    { title: 'What worked', kind: 'aiSummary', placeholder: 'What this item did well compared with your typical results.' },
    { title: 'What limited performance', kind: 'aiHypothesis', placeholder: 'Where it fell short of your best items of the same type, and possible reasons.' },
    { title: 'What to change', kind: 'aiSuggestion', placeholder: 'Specific changes supported by your stronger content.' },
    { title: 'What to test next', kind: 'aiSuggestion', placeholder: 'One experiment for your next item of this type, and the metric to judge it by.' },
  ],
  low: [
    { title: 'Why it may have underperformed', kind: 'aiHypothesis', placeholder: 'Possible reasons it trailed your similar content — never presented as proven causes.' },
    { title: 'What the data shows', kind: 'observed', placeholder: 'The measured numbers, compared with your typical item of the same type.' },
    { title: 'What to stop', kind: 'aiSuggestion', placeholder: 'Habits that repeatedly appear in your weaker content.' },
    { title: 'What to try instead', kind: 'aiSuggestion', placeholder: 'A replacement approach based on what works for you.' },
  ],
};

export const TIER_LABELS: Record<Tier, { label: string; title: string; cta: string }> = {
  top: { label: 'Top', title: 'Top content', cta: 'Why it worked' },
  moderate: { label: 'Moderate', title: 'Moderate content', cta: 'How to improve' },
  low: { label: 'Low', title: 'Low content', cta: 'Why it underperformed' },
};

const type = (spec: ContentTypeSpec) => spec;

export const BLUEPRINTS: Record<SocialPlatform, PlatformBlueprint> = {
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    icon: 'logo-instagram',
    accent: colors.magenta,
    accountNoun: 'Account',
    selectTitle: 'Choose an Instagram account',
    selectHint: 'Business and Creator accounts linked to your Facebook Pages.',
    audienceLabel: 'Followers',
    content: { singular: 'post', plural: 'posts' },
    contentTypes: [
      type({ id: 'REEL', plural: 'Reels', singular: 'Reel', noun: 'Reel', nounPlural: 'Reels', icon: 'film-outline', color: colors.magenta, light: colors.magentaLight }),
      type({ id: 'POST', plural: 'Posts', singular: 'Post', noun: 'post', nounPlural: 'posts', icon: 'image-outline', color: colors.primaryBright, light: colors.sky }),
      type({ id: 'CAROUSEL', plural: 'Carousels', singular: 'Carousel', noun: 'carousel', nounPlural: 'carousels', icon: 'albums-outline', color: colors.violet, light: colors.violetLight }),
      type({ id: 'STORY', plural: 'Stories', singular: 'Story', noun: 'Story', nounPlural: 'Stories', icon: 'ellipse-outline', color: colors.warning, light: colors.warningLight }),
      type({ id: 'LIVE', plural: 'Live', singular: 'Live', noun: 'Live video', nounPlural: 'Live videos', icon: 'radio-outline', color: colors.danger, light: colors.dangerLight }),
    ],
    metrics: [
      { key: 'reach', label: 'Reach', kind: 'count' },
      { key: 'impressions', label: 'Impressions', kind: 'count' },
      { key: 'views', label: 'Views', kind: 'count' },
      { key: 'likes', label: 'Likes', kind: 'count' },
      { key: 'comments', label: 'Comments', kind: 'count' },
      { key: 'shares', label: 'Shares', kind: 'count' },
      { key: 'saves', label: 'Saves', kind: 'count' },
      { key: 'profileVisits', label: 'Profile visits', kind: 'count' },
      { key: 'follows', label: 'Follows', kind: 'count' },
      { key: 'engagementRate', label: 'Engagement', kind: 'percent' },
    ],
    cardMetrics: ['views', 'likes', 'comments'],
    benchmark: 'interactions (likes + comments)',
    benchmarkMetric: 'likes',
    connect: {
      requirement: 'You need an Instagram Business or Creator account.',
      access: 'Media Navigator asks Meta for read-only access to your media and insights.',
    },
    happeningTemplate: (t) => `Your ${t} are getting the strongest response.`,
    question: (tier, t) =>
      tier === 'top'
        ? `Why did this ${t.noun} outperform your other ${t.nounPlural}?`
        : tier === 'moderate'
          ? `How could this ${t.noun} perform like your best ${t.nounPlural}?`
          : `Why did this ${t.noun} fall behind your other ${t.nounPlural}?`,
    patterns: [
      { id: 'format', title: 'Format patterns', question: 'Which formats get the strongest response?', source: 'Interactions per Reel, post and carousel.', icon: 'layers-outline' },
      { id: 'topic', title: 'Topic patterns', question: 'Which subjects keep appearing in your top posts?', source: 'Captions of your top and low posts.', icon: 'pricetags-outline' },
      { id: 'hook', title: 'Hook & presentation', question: 'How do your strongest posts open?', source: 'Opening lines and formats of your top posts.', icon: 'sparkles-outline' },
      { id: 'timing', title: 'Timing patterns', question: 'When does your content get the most response?', source: 'Publishing day and hour vs interactions.', icon: 'time-outline' },
      { id: 'engagement', title: 'Engagement patterns', question: 'What drives saves, shares and comments?', source: 'Per-post saves, shares and comments.', icon: 'chatbubbles-outline' },
    ],
  },

  facebook: {
    id: 'facebook',
    name: 'Facebook',
    icon: 'logo-facebook',
    accent: colors.primaryBright,
    accountNoun: 'Page',
    selectTitle: 'Choose a Facebook Page',
    selectHint: 'Pages where you have a role.',
    audienceLabel: 'Followers',
    content: { singular: 'post', plural: 'posts' },
    contentTypes: [
      type({ id: 'TEXT', plural: 'Text', singular: 'Text post', noun: 'text post', nounPlural: 'text posts', icon: 'document-text-outline', color: colors.navy, light: colors.neutral100, textFirst: true }),
      type({ id: 'IMAGE', plural: 'Image', singular: 'Image post', noun: 'image post', nounPlural: 'image posts', icon: 'image-outline', color: colors.primaryBright, light: colors.sky }),
      type({ id: 'VIDEO', plural: 'Video', singular: 'Video', noun: 'video', nounPlural: 'videos', icon: 'videocam-outline', color: colors.cyan, light: colors.cyanLight }),
      type({ id: 'REEL', plural: 'Reels', singular: 'Reel', noun: 'Reel', nounPlural: 'Reels', icon: 'film-outline', color: colors.magenta, light: colors.magentaLight }),
      type({ id: 'LINK', plural: 'Links', singular: 'Link post', noun: 'link post', nounPlural: 'link posts', icon: 'link-outline', color: colors.violet, light: colors.violetLight }),
      type({ id: 'LIVE', plural: 'Live', singular: 'Live', noun: 'Live video', nounPlural: 'Live videos', icon: 'radio-outline', color: colors.danger, light: colors.dangerLight }),
    ],
    metrics: [
      { key: 'reach', label: 'Reach', kind: 'count' },
      { key: 'impressions', label: 'Impressions', kind: 'count' },
      { key: 'views', label: 'Views', kind: 'count' },
      { key: 'reactions', label: 'Reactions', kind: 'count' },
      { key: 'comments', label: 'Comments', kind: 'count' },
      { key: 'shares', label: 'Shares', kind: 'count' },
      { key: 'clicks', label: 'Clicks', kind: 'count' },
      { key: 'linkClicks', label: 'Link clicks', kind: 'count' },
      { key: 'engagementRate', label: 'Engagement', kind: 'percent' },
    ],
    cardMetrics: ['reach', 'reactions', 'comments'],
    benchmark: 'reach and reactions',
    benchmarkMetric: 'reach',
    connect: {
      requirement: 'You need a role on the Facebook Page you want to connect.',
      access: 'Media Navigator asks Meta for read-only access to your Pages’ posts and insights.',
    },
    happeningTemplate: (t) => `Your ${t} are reaching the most people.`,
    question: (tier, t) =>
      tier === 'top'
        ? `Why did this ${t.noun} reach and engage more people than your other ${t.nounPlural}?`
        : tier === 'moderate'
          ? `What would help this ${t.noun} reach more people?`
          : `Why did this ${t.noun} reach fewer people than your other ${t.nounPlural}?`,
    patterns: [
      { id: 'type', title: 'Best content type', question: 'Which post types reach the most people?', source: 'Reach per text, image, video, Reel and link post.', icon: 'layers-outline' },
      { id: 'reach', title: 'Reach patterns', question: 'What do your widest-reaching posts have in common?', source: 'Reach of your top posts vs your typical post.', icon: 'radio-outline' },
      { id: 'reactions', title: 'Reaction patterns', question: 'What gets people to react, comment and share?', source: 'Reactions, comments and shares per post.', icon: 'heart-outline' },
      { id: 'clicks', title: 'Click behavior', question: 'Which posts send people to your links?', source: 'Clicks and link clicks per post.', icon: 'hand-left-outline' },
      { id: 'timing', title: 'Timing', question: 'When do your posts reach the most people?', source: 'Publishing day and hour vs reach.', icon: 'time-outline' },
    ],
  },

  youtube: {
    id: 'youtube',
    name: 'YouTube',
    icon: 'logo-youtube',
    accent: colors.danger,
    accountNoun: 'Channel',
    selectTitle: 'Choose a YouTube channel',
    selectHint: 'Channels your Google account owns or manages.',
    audienceLabel: 'Subscribers',
    content: { singular: 'video', plural: 'videos' },
    contentTypes: [
      type({ id: 'SHORT', plural: 'Shorts', singular: 'Short', noun: 'Short', nounPlural: 'Shorts', icon: 'phone-portrait-outline', color: colors.danger, light: colors.dangerLight }),
      type({ id: 'LONG', plural: 'Long-form', singular: 'Video', noun: 'video', nounPlural: 'long-form videos', icon: 'play-circle-outline', color: colors.navy, light: colors.neutral100 }),
      type({ id: 'LIVE', plural: 'Live', singular: 'Live stream', noun: 'live stream', nounPlural: 'live streams', icon: 'radio-outline', color: colors.magenta, light: colors.magentaLight }),
      type({ id: 'POST', plural: 'Posts', singular: 'Post', noun: 'community post', nounPlural: 'community posts', icon: 'chatbox-outline', color: colors.violet, light: colors.violetLight, textFirst: true }),
    ],
    metrics: [
      { key: 'views', label: 'Views', kind: 'count' },
      { key: 'watchHours', label: 'Watch time', kind: 'hours' },
      { key: 'avgViewDuration', label: 'Avg view duration', kind: 'duration' },
      { key: 'avgPercentViewed', label: 'Avg % viewed', kind: 'percent' },
      { key: 'likes', label: 'Likes', kind: 'count' },
      { key: 'comments', label: 'Comments', kind: 'count' },
      { key: 'shares', label: 'Shares', kind: 'count' },
      { key: 'subscribersNet', label: 'Subscribers', kind: 'signed' },
      { key: 'impressions', label: 'Impressions', kind: 'count' },
      { key: 'ctr', label: 'Click-through', kind: 'percent' },
      { key: 'returningViewers', label: 'Returning viewers', kind: 'percent' },
    ],
    cardMetrics: ['views', 'watchHours', 'avgPercentViewed'],
    benchmark: 'views and watch time',
    benchmarkMetric: 'views',
    connect: {
      requirement: 'Sign in with the Google account that owns or manages the channel.',
      access: 'Media Navigator asks Google for read-only access to your channel, videos and YouTube Analytics.',
    },
    happeningTemplate: (t) => `Your ${t} are getting the strongest view response.`,
    question: (tier, t) =>
      tier === 'top'
        ? `Why did this ${t.noun} get more views and watch time than your other ${t.nounPlural}?`
        : tier === 'moderate'
          ? `What would help this ${t.noun} hold viewers longer?`
          : `Why did this ${t.noun} get fewer views and less watch time than your other ${t.nounPlural}?`,
    patterns: [
      { id: 'format', title: 'Format patterns', question: 'Do Shorts or long-form videos grow your channel more?', source: 'Views, watch time and subscribers per format.', icon: 'layers-outline' },
      { id: 'watch', title: 'Watch-time patterns', question: 'Which videos earn the most watch time?', source: 'Watch time and average view duration per video.', icon: 'hourglass-outline' },
      { id: 'retention', title: 'Retention signals', question: 'Where do viewers keep watching — and where do they leave?', source: 'Average % viewed per video.', icon: 'trending-down-outline' },
      { id: 'packaging', title: 'Title & thumbnail', question: 'Which titles and thumbnails get clicked?', source: 'Impressions and click-through per video.', icon: 'image-outline' },
      { id: 'timing', title: 'Publishing patterns', question: 'When do your uploads get the strongest start?', source: 'Publishing day and hour vs views.', icon: 'time-outline' },
      { id: 'subscribers', title: 'Subscriber response', question: 'Which videos bring in — or lose — subscribers?', source: 'Subscribers gained and lost per video.', icon: 'people-outline' },
    ],
  },

  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: 'logo-linkedin',
    accent: colors.primary,
    accountNoun: 'Organization',
    selectTitle: 'Choose a LinkedIn page',
    selectHint: 'Company pages you administer.',
    audienceLabel: 'Followers',
    content: { singular: 'post', plural: 'posts' },
    contentTypes: [
      type({ id: 'TEXT', plural: 'Text', singular: 'Text post', noun: 'text post', nounPlural: 'text posts', icon: 'document-text-outline', color: colors.navy, light: colors.neutral100, textFirst: true }),
      type({ id: 'IMAGE', plural: 'Image', singular: 'Image post', noun: 'image post', nounPlural: 'image posts', icon: 'image-outline', color: colors.primaryBright, light: colors.sky }),
      type({ id: 'VIDEO', plural: 'Video', singular: 'Video', noun: 'video post', nounPlural: 'video posts', icon: 'videocam-outline', color: colors.cyan, light: colors.cyanLight }),
      type({ id: 'ARTICLE', plural: 'Article', singular: 'Article', noun: 'article', nounPlural: 'articles', icon: 'newspaper-outline', color: colors.success, light: colors.successLight }),
      type({ id: 'DOCUMENT', plural: 'Document', singular: 'Document', noun: 'document post', nounPlural: 'document posts', icon: 'document-attach-outline', color: colors.violet, light: colors.violetLight }),
      type({ id: 'POLL', plural: 'Poll', singular: 'Poll', noun: 'poll', nounPlural: 'polls', icon: 'stats-chart-outline', color: colors.warning, light: colors.warningLight, textFirst: true }),
      type({ id: 'LINK', plural: 'Link', singular: 'Link post', noun: 'link post', nounPlural: 'link posts', icon: 'link-outline', color: colors.magenta, light: colors.magentaLight }),
    ],
    metrics: [
      { key: 'impressions', label: 'Impressions', kind: 'count' },
      { key: 'membersReached', label: 'Members reached', kind: 'count' },
      { key: 'reactions', label: 'Reactions', kind: 'count' },
      { key: 'comments', label: 'Comments', kind: 'count' },
      { key: 'reposts', label: 'Reposts', kind: 'count' },
      { key: 'saves', label: 'Saves', kind: 'count' },
      { key: 'clicks', label: 'Clicks', kind: 'count' },
      { key: 'ctr', label: 'Click-through', kind: 'percent' },
      { key: 'engagementRate', label: 'Engagement', kind: 'percent' },
      { key: 'followersGained', label: 'Followers gained', kind: 'count' },
    ],
    cardMetrics: ['impressions', 'reactions', 'clicks'],
    benchmark: 'engagement and clicks',
    benchmarkMetric: 'impressions',
    connect: {
      requirement: 'You need to be an administrator of the LinkedIn company page.',
      access: 'Media Navigator asks LinkedIn for read-only access to your organization’s posts and statistics.',
    },
    happeningTemplate: (t) => `Your ${t} are generating the strongest engagement.`,
    question: (tier, t) =>
      tier === 'top'
        ? `Why did this ${t.noun} generate more engagement than your typical ${t.nounPlural}?`
        : tier === 'moderate'
          ? `What would help this ${t.noun} get more reactions and clicks?`
          : `Why did this ${t.noun} get less engagement than your typical ${t.nounPlural}?`,
    patterns: [
      { id: 'type', title: 'Post-type patterns', question: 'Which post types engage your followers most?', source: 'Engagement per text, image, video, article, document and poll.', icon: 'layers-outline' },
      { id: 'topic', title: 'Topic patterns', question: 'Which subjects earn reactions and reposts?', source: 'Post text of your top and low posts.', icon: 'pricetags-outline' },
      { id: 'engagement', title: 'Engagement patterns', question: 'What gets members to comment and repost?', source: 'Reactions, comments and reposts per post.', icon: 'chatbubbles-outline' },
      { id: 'clicks', title: 'Click patterns', question: 'Which posts send people to your links?', source: 'Clicks and click-through per post.', icon: 'hand-left-outline' },
      { id: 'timing', title: 'Timing patterns', question: 'When do your posts reach the most members?', source: 'Publishing day and hour vs impressions.', icon: 'time-outline' },
      { id: 'audience', title: 'Audience response', question: 'Which posts bring in new followers?', source: 'Followers gained per post.', icon: 'people-outline' },
    ],
  },
};

export function blueprintOf(platform: SocialPlatform): PlatformBlueprint {
  return BLUEPRINTS[platform];
}

export function contentType(blueprint: PlatformBlueprint, id: string): ContentTypeSpec {
  return blueprint.contentTypes.find((t) => t.id === id) ?? blueprint.contentTypes[0];
}

/** Formats a metric value for display; null is "not available", never zero. */
export function formatMetric(value: number | null | undefined, kind: MetricKind): string | null {
  if (value === null || value === undefined) return null;
  const compact = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : String(Math.round(n)));
  switch (kind) {
    case 'percent':
      return `${value.toFixed(1).replace(/\.0$/, '')}%`;
    case 'duration': {
      const minutes = Math.floor(value / 60);
      const seconds = Math.round(value % 60);
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }
    case 'hours':
      return `${compact(value)} h`;
    case 'signed':
      return `${value > 0 ? '+' : value < 0 ? '−' : ''}${compact(Math.abs(value))}`;
    default:
      return compact(value);
  }
}

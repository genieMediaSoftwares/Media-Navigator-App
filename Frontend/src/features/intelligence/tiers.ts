import { formatCompactNumber, formatSignedPercent } from '@/lib/format';
import { ContentFormat, ContentTier, FormatPerformance, IntelligencePost } from '@/types/api';

import { FORMAT_LABELS } from './labels';

export type TierFilter = 'top' | 'moderate' | 'low';

/** Plain-language copy for each tier: the question the tier answers and the action it leads to. */
export const TIER_COPY: Record<TierFilter, { label: string; title: string; subtitle: string; cta: string; tone: 'positive' | 'neutral' | 'negative' }> = {
  top: {
    label: 'Top',
    title: 'Top content',
    subtitle: 'At least twice your typical post.',
    cta: 'Why it worked',
    tone: 'positive',
  },
  moderate: {
    label: 'Moderate',
    title: 'Moderate content',
    subtitle: 'Around your normal range.',
    cta: 'How to improve',
    tone: 'neutral',
  },
  low: {
    label: 'Low',
    title: 'Low content',
    subtitle: 'Half your typical post or less.',
    cta: 'Why it underperformed',
    tone: 'negative',
  },
};

/** Default order for each tier's list: best first for top/moderate, weakest first for low. */
export const TIER_SORT = { top: 'interactions', moderate: 'interactions', low: 'lowest' } as const;

export function ctaForTier(tier: ContentTier | null | undefined): string {
  if (tier === 'top') return TIER_COPY.top.cta;
  if (tier === 'low') return TIER_COPY.low.cta;
  if (tier === 'moderate') return TIER_COPY.moderate.cta;
  return 'See details';
}

/** "3.5× typical", "−85% vs typical" or "About typical", from the percent difference to the typical post. */
export function formatVsTypical(percent: number | null | undefined): string | null {
  if (percent === null || percent === undefined) return null;
  if (percent >= 100) {
    const multiple = 1 + percent / 100;
    return `${multiple >= 100 ? Math.round(multiple).toLocaleString() : multiple.toFixed(1).replace(/\.0$/, '')}× typical`;
  }
  if (Math.abs(percent) < 10) return 'About typical';
  return `${formatSignedPercent(percent)} vs typical`;
}

export function toneOf(percent: number | null | undefined): 'positive' | 'neutral' | 'negative' {
  if (percent === null || percent === undefined || Math.abs(percent) < 10) return 'neutral';
  return percent > 0 ? 'positive' : 'negative';
}

/** A post's badge: its measured difference from the typical post. */
export function typicalBadge(post: IntelligencePost): { text: string; tone: 'positive' | 'neutral' | 'negative' } | null {
  const text = formatVsTypical(post.vsTypicalPercent);
  return text ? { text, tone: toneOf(post.vsTypicalPercent) } : null;
}

/**
 * The strongest format by average interactions, among formats with at least 3 posts, compared with
 * the next one. Null when there are not two comparable formats (nothing honest to say).
 */
export function leadingFormat(formats: FormatPerformance[]): { best: FormatPerformance; next: FormatPerformance } | null {
  const comparable = formats.filter((f) => f.count >= 3 && f.avgInteractions !== null).sort((a, b) => (b.avgInteractions ?? 0) - (a.avgInteractions ?? 0));
  if (comparable.length < 2) return null;
  return { best: comparable[0], next: comparable[1] };
}

/** "Reels average 1.8K interactions — 260× your posts (6.9)." Measured, not interpreted. */
export function describeLeadingFormat(best: FormatPerformance, next: FormatPerformance): string {
  const bestName = FORMAT_LABELS[best.format].plural;
  const nextName = FORMAT_LABELS[next.format].plural.toLowerCase();
  const a = best.avgInteractions ?? 0;
  const b = next.avgInteractions ?? 0;
  const ratio = b > 0 ? a / b : null;
  const comparison = ratio !== null && ratio >= 1.5 ? `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}× your ${nextName} (${formatCompactNumber(b)})` : `vs ${formatCompactNumber(b)} for your ${nextName}`;
  return `${bestName} average ${formatCompactNumber(a)} interactions, ${comparison}.`;
}

export function formatPlural(format: ContentFormat, count: number): string {
  return FORMAT_LABELS[format][count === 1 ? 'singular' : 'plural'].toLowerCase();
}

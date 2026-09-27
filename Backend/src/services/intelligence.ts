import { InstagramMediaRow } from '../db/instagramData';

// Deterministic analytics over synced Instagram data. Nothing here calls Meta or Gemini and
// nothing is estimated: every number is computed from stored rows, and a metric that was not
// returned by Meta stays null ("not available") instead of becoming zero.

export type ContentFormat = 'REEL' | 'POST' | 'CAROUSEL' | 'VIDEO' | 'STORY';

/** Mirrors MEDIA_FORMAT_SQL in db/instagramData.ts. */
export function classifyFormat(mediaType: string | null, mediaProductType: string | null): ContentFormat {
	if (mediaProductType === 'REELS') return 'REEL';
	if (mediaProductType === 'STORY') return 'STORY';
	if (mediaType === 'CAROUSEL_ALBUM') return 'CAROUSEL';
	if (mediaType === 'VIDEO') return 'VIDEO';
	return 'POST';
}

export const CONTENT_FORMATS: readonly ContentFormat[] = ['REEL', 'POST', 'CAROUSEL', 'VIDEO', 'STORY'];

/** Published and documented with every intelligence response so the app can show "How this is calculated". */
export const METRIC_DEFINITIONS = {
	interactions: 'Likes + comments on a post, as reported by Instagram. Available for every synced post.',
	engagementRate:
		'Interactions ÷ current follower count × 100. Uses today’s follower count, not the count on the day the post was published.',
	baseline:
		'Account average (mean) interactions per post, across all synced posts that have like or comment data. The median (typical post) is shown alongside, because a few viral posts can lift the mean far above what most posts receive.',
	populations:
		'Intelligence averages use all synced posts (up to 200). The Home screen and Instagram account screen show engagement over the latest 50 synced posts. Same formula, different set of posts.',
	vsBaseline: '(Post interactions − account average) ÷ account average × 100.',
	views: 'Reported by Instagram media insights. Not available for media without insights access.',
	needsAttention:
		'Posts older than 3 days whose interactions are below the account average. Newer posts are excluded because they are still accumulating engagement.',
} as const;

/** Minimum posts with interaction data before top/bottom rankings are shown. */
export const MIN_POSTS_FOR_RANKING = 6;
/** Minimum posts with interaction data and timestamps before timing patterns are shown. */
export const MIN_POSTS_FOR_TIMING = 30;
const MIN_POSTS_PER_TIMING_CELL = 2;
const MIN_POSTS_PER_WINDOW = 3;
const ATTENTION_MIN_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const RANKED_LIST_SIZE = 5;

export interface PostMetrics {
	views: number | null;
	reach: number | null;
	likes: number | null;
	comments: number | null;
	saves: number | null;
	shares: number | null;
	/** Meta's own total_interactions insight (includes saves and shares), when available. */
	totalInteractions: number | null;
}

export interface IntelligencePost {
	id: string;
	format: ContentFormat;
	caption: string | null;
	permalink: string | null;
	/** Image to render: the thumbnail for videos/reels, the media URL otherwise. */
	previewUrl: string | null;
	publishedAt: string | null;
	metrics: PostMetrics;
	/** likes + comments; null when Meta returned neither. */
	interactions: number | null;
	/** Percent; null when interactions or follower count are unknown. */
	engagementRate: number | null;
	/** Percent difference from the account baseline; null when either side is unknown. */
	vsBaselinePercent: number | null;
}

function round(value: number, digits = 2): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

/** Meta returns "2026-09-25T10:00:00+0000", which some JS engines cannot parse. */
export function normalizeTimestamp(raw: string | null): string | null {
	if (!raw) return null;
	const fixed = raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
	const date = new Date(fixed);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function interactionsOf(likes: number | null, comments: number | null): number | null {
	if (likes === null && comments === null) return null;
	return (likes ?? 0) + (comments ?? 0);
}

export function toIntelligencePost(row: InstagramMediaRow, followers: number | null, baseline: number | null): IntelligencePost {
	const format = classifyFormat(row.media_type, row.media_product_type);
	const interactions = interactionsOf(row.like_count, row.comments_count);
	const isVideo = format === 'REEL' || format === 'VIDEO' || row.media_type === 'VIDEO';
	return {
		id: row.id,
		format,
		caption: row.caption,
		permalink: row.permalink,
		previewUrl: (isVideo ? row.thumbnail_url : row.media_url) ?? row.thumbnail_url ?? null,
		publishedAt: normalizeTimestamp(row.timestamp),
		metrics: {
			views: row.views,
			reach: row.reach,
			likes: row.like_count,
			comments: row.comments_count,
			saves: row.saved,
			shares: row.shares,
			totalInteractions: row.total_interactions,
		},
		interactions,
		engagementRate: interactions !== null && followers !== null && followers > 0 ? round((interactions / followers) * 100) : null,
		vsBaselinePercent:
			interactions !== null && baseline !== null && baseline > 0 ? round(((interactions - baseline) / baseline) * 100, 1) : null,
	};
}

function average(values: Array<number | null>): { value: number | null; sampleSize: number } {
	const present = values.filter((v): v is number => v !== null);
	if (present.length === 0) return { value: null, sampleSize: 0 };
	return { value: round(present.reduce((a, b) => a + b, 0) / present.length), sampleSize: present.length };
}

export interface Baseline {
	/** Mean interactions per post: the comparison point for "vs account average". */
	avgInteractions: number | null;
	/** Median interactions per post: what a typical post gets. Reported so outlier skew is visible. */
	medianInteractions: number | null;
	sampleSize: number;
}

export function computeBaseline(rows: InstagramMediaRow[]): Baseline {
	const values = rows.map((r) => interactionsOf(r.like_count, r.comments_count)).filter((v): v is number => v !== null);
	const { value, sampleSize } = average(values);
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	const median = sorted.length === 0 ? null : sorted.length % 2 ? sorted[mid] : round((sorted[mid - 1] + sorted[mid]) / 2);
	return { avgInteractions: value, medianInteractions: median, sampleSize };
}

export interface FormatPerformance {
	format: ContentFormat;
	count: number;
	avgViews: number | null;
	/** Posts of this format that had a views value; avgViews is computed over these only. */
	viewsSampleSize: number;
	avgLikes: number | null;
	avgComments: number | null;
	avgInteractions: number | null;
	avgEngagementRate: number | null;
}

export function computeFormatPerformance(posts: IntelligencePost[]): FormatPerformance[] {
	const result: FormatPerformance[] = [];
	for (const format of CONTENT_FORMATS) {
		const group = posts.filter((p) => p.format === format);
		if (group.length === 0) continue;
		const views = average(group.map((p) => p.metrics.views));
		result.push({
			format,
			count: group.length,
			avgViews: views.value,
			viewsSampleSize: views.sampleSize,
			avgLikes: average(group.map((p) => p.metrics.likes)).value,
			avgComments: average(group.map((p) => p.metrics.comments)).value,
			avgInteractions: average(group.map((p) => p.interactions)).value,
			avgEngagementRate: average(group.map((p) => p.engagementRate)).value,
		});
	}
	return result.sort((a, b) => b.count - a.count);
}

export interface ArchiveSummary {
	syncedCount: number;
	/** media_count reported by the Instagram profile; may exceed syncedCount. */
	profileMediaCount: number | null;
	formatCounts: Array<{ format: ContentFormat; count: number }>;
	/** Sum of views over posts that have views; null when no post has views. */
	totalViews: number | null;
	viewsAvailableCount: number;
	totalInteractions: number | null;
	avgEngagementRate: number | null;
	oldestPublishedAt: string | null;
	newestPublishedAt: string | null;
}

export function computeArchiveSummary(posts: IntelligencePost[], profileMediaCount: number | null): ArchiveSummary {
	const withViews = posts.filter((p) => p.metrics.views !== null);
	const withInteractions = posts.filter((p) => p.interactions !== null);
	const dates = posts.map((p) => p.publishedAt).filter((d): d is string => d !== null).sort();
	return {
		syncedCount: posts.length,
		profileMediaCount,
		formatCounts: CONTENT_FORMATS.map((format) => ({ format, count: posts.filter((p) => p.format === format).length })).filter(
			(f) => f.count > 0,
		),
		totalViews: withViews.length > 0 ? withViews.reduce((sum, p) => sum + (p.metrics.views ?? 0), 0) : null,
		viewsAvailableCount: withViews.length,
		totalInteractions: withInteractions.length > 0 ? withInteractions.reduce((sum, p) => sum + (p.interactions ?? 0), 0) : null,
		avgEngagementRate: average(posts.map((p) => p.engagementRate)).value,
		oldestPublishedAt: dates[0] ?? null,
		newestPublishedAt: dates[dates.length - 1] ?? null,
	};
}

export function rankPosts(posts: IntelligencePost[], baseline: number | null, now: number) {
	const ranked = posts.filter((p) => p.interactions !== null);
	if (baseline === null || ranked.length < MIN_POSTS_FOR_RANKING) {
		return { sufficient: false, working: [] as IntelligencePost[], attention: [] as IntelligencePost[] };
	}
	const working = [...ranked]
		.filter((p) => (p.interactions ?? 0) > baseline)
		.sort((a, b) => (b.interactions ?? 0) - (a.interactions ?? 0))
		.slice(0, RANKED_LIST_SIZE);
	const workingIds = new Set(working.map((p) => p.id));
	const attention = ranked
		.filter((p) => !workingIds.has(p.id) && (p.interactions ?? 0) < baseline)
		.filter((p) => p.publishedAt !== null && now - Date.parse(p.publishedAt) >= ATTENTION_MIN_AGE_MS)
		.sort((a, b) => (a.interactions ?? 0) - (b.interactions ?? 0))
		.slice(0, RANKED_LIST_SIZE);
	return { sufficient: true, working, attention };
}

// ---- Timing ---------------------------------------------------------------

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Returns a valid IANA zone, or UTC when the client sent none or an unknown one. */
export function resolveTimeZone(raw: string | null): string {
	if (!raw) return 'UTC';
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: raw });
		return raw;
	} catch {
		return 'UTC';
	}
}

export function localDayHour(iso: string, timeZone: string): { dayOfWeek: number; hour: number } | null {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
	const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
	const hour = Number(parts.find((p) => p.type === 'hour')?.value);
	const dayOfWeek = WEEKDAY_INDEX[weekday];
	if (dayOfWeek === undefined || !Number.isFinite(hour)) return null;
	return { dayOfWeek, hour: hour % 24 };
}

const BLOCK_HOURS = 3;

export interface TimingCell {
	dayOfWeek: number;
	startHour: number;
	endHour: number;
	/** 0–100: this cell's average interactions relative to the best cell. */
	score: number;
	postCount: number;
	avgInteractions: number;
}

export interface TimingAnalysis {
	timezone: string;
	sufficient: boolean;
	postsAnalyzed: number;
	minimumRequired: number;
	heatmap: TimingCell[];
	/** Best cells with at least MIN_POSTS_PER_WINDOW posts, strongest first. */
	windows: TimingCell[];
}

export function computeTiming(posts: IntelligencePost[], timeZone: string): TimingAnalysis {
	const usable = posts.filter((p) => p.interactions !== null && p.publishedAt !== null);
	const base: TimingAnalysis = {
		timezone: timeZone,
		sufficient: false,
		postsAnalyzed: usable.length,
		minimumRequired: MIN_POSTS_FOR_TIMING,
		heatmap: [],
		windows: [],
	};
	if (usable.length < MIN_POSTS_FOR_TIMING) return base;

	const buckets = new Map<string, { dayOfWeek: number; startHour: number; total: number; count: number }>();
	for (const post of usable) {
		const local = localDayHour(post.publishedAt as string, timeZone);
		if (!local) continue;
		const startHour = Math.floor(local.hour / BLOCK_HOURS) * BLOCK_HOURS;
		const key = `${local.dayOfWeek}:${startHour}`;
		const bucket = buckets.get(key) ?? { dayOfWeek: local.dayOfWeek, startHour, total: 0, count: 0 };
		bucket.total += post.interactions as number;
		bucket.count += 1;
		buckets.set(key, bucket);
	}

	const cells = [...buckets.values()].filter((b) => b.count >= MIN_POSTS_PER_TIMING_CELL);
	if (cells.length === 0) return base;
	const best = Math.max(...cells.map((c) => c.total / c.count));
	const heatmap: TimingCell[] = cells.map((c) => ({
		dayOfWeek: c.dayOfWeek,
		startHour: c.startHour,
		endHour: c.startHour + BLOCK_HOURS,
		score: best > 0 ? Math.round(((c.total / c.count) / best) * 100) : 0,
		postCount: c.count,
		avgInteractions: round(c.total / c.count, 1),
	}));
	const windows = heatmap
		.filter((c) => c.postCount >= MIN_POSTS_PER_WINDOW)
		.sort((a, b) => b.avgInteractions - a.avgInteractions)
		.slice(0, 3);

	return { ...base, sufficient: true, heatmap, windows };
}

// ---- Observed facts for a single post ---------------------------------------

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Measurable properties of a post. These are facts, never interpretations. */
export function observedFactors(post: IntelligencePost, timeZone: string): Array<{ label: string; value: string }> {
	const facts: Array<{ label: string; value: string }> = [{ label: 'Format', value: post.format }];
	if (post.publishedAt) {
		const local = localDayHour(post.publishedAt, timeZone);
		if (local) {
			facts.push({ label: 'Published', value: `${DAY_NAMES[local.dayOfWeek]}, ${String(local.hour).padStart(2, '0')}:00 (${timeZone})` });
		}
	}
	const caption = post.caption ?? '';
	facts.push({ label: 'Caption length', value: caption ? `${[...caption].length} characters` : 'No caption' });
	facts.push({ label: 'Hashtags', value: String((caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length) });
	facts.push({ label: 'Mentions', value: String((caption.match(/@[\w.]+/g) ?? []).length) });
	return facts;
}

import type { ContentRow } from '../db/content';
import type { Platform } from '../models';
import { CONTENT_FORMATS, ContentFormat, IntelligencePost, localDayHour, MIN_POSTS_FOR_RANKING, MIN_POSTS_FOR_TIMING } from './intelligence';

// Deterministic content analytics over the complete synced dataset: performance score, dashboard
// totals, trends over time, heat maps, posting-time recommendation, per-post reasons, detected
// trends and prioritized tasks. Nothing here calls a platform or an AI model and nothing is
// estimated. A metric the platform did not return is skipped (never treated as zero), and every
// statement carries the numbers and sample sizes it was computed from.

const DAY_MS = 86_400_000;
const NEW_POST_MS = 3 * DAY_MS;
const BLOCK_HOURS = 3;
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FORMAT_NAMES: Record<ContentFormat, { one: string; many: string }> = {
	REEL: { one: 'Reel', many: 'Reels' },
	POST: { one: 'Post', many: 'Posts' },
	CAROUSEL: { one: 'Carousel', many: 'Carousels' },
	VIDEO: { one: 'Video', many: 'Videos' },
	STORY: { one: 'Story', many: 'Stories' },
	TEXT: { one: 'Text post', many: 'Text posts' },
	IMAGE: { one: 'Image post', many: 'Image posts' },
	LINK: { one: 'Link post', many: 'Link posts' },
	LIVE: { one: 'Live video', many: 'Live videos' },
	ARTICLE: { one: 'Article', many: 'Articles' },
	DOCUMENT: { one: 'Document post', many: 'Document posts' },
	POLL: { one: 'Poll', many: 'Polls' },
};

/** Content-type names in the platform's own vocabulary (Facebook albums, LinkedIn multi-image posts, Instagram photos). */
export function formatName(format: ContentFormat, platform: Platform): { one: string; many: string } {
	if (format === 'CAROUSEL' && platform === 'facebook') return { one: 'Album', many: 'Albums' };
	if (format === 'CAROUSEL' && platform === 'linkedin') return { one: 'Multi-image post', many: 'Multi-image posts' };
	if (format === 'POST' && platform === 'instagram') return { one: 'Photo', many: 'Photos' };
	if (format === 'LIVE' && platform === 'youtube') return { one: 'Live stream', many: 'Live streams' };
	return FORMAT_NAMES[format];
}

function round(value: number, digits = 2): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function mean(values: number[]): number | null {
	return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function medianOf(values: Array<number | null | undefined>): number | null {
	return median(present(values));
}

function present(values: Array<number | null | undefined>): number[] {
	return values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

function compact(value: number): string {
	const abs = Math.abs(value);
	if (abs >= 1_000_000) return `${round(value / 1_000_000, 1)}M`;
	if (abs >= 10_000) return `${round(value / 1_000, 1)}K`;
	if (abs >= 1_000) return `${round(value / 1_000, 1)}K`;
	return String(round(value, abs < 10 ? 2 : 1));
}

function pct(value: number): string {
	return `${round(value, 2)}%`;
}

/** "2.4× the …" above 1.5×, "+34%" / "−42%" otherwise. */
function describeRatio(ratio: number): string {
	if (ratio >= 1.5) return `${round(ratio, 1)}×`;
	const change = Math.round((ratio - 1) * 100);
	return change >= 0 ? `+${change}%` : `−${Math.abs(change)}%`;
}

/** "2.4× the views of X" above 1.5×, "34% more views than X" otherwise. */
function moreThan(ratio: number, metric: string, reference: string): string {
	return ratio >= 1.5 ? `${round(ratio, 1)}× the ${metric} of ${reference}` : `${Math.round((ratio - 1) * 100)}% more ${metric} than ${reference}`;
}

function hourLabel(hour: number): string {
	const h = hour % 24;
	const suffix = h < 12 ? 'AM' : 'PM';
	const display = h % 12 === 0 ? 12 : h % 12;
	return `${display} ${suffix}`;
}

export function windowLabel(startHour: number, endHour: number): string {
	return `${hourLabel(startHour)}–${hourLabel(endHour)}`;
}

// ---- Performance score --------------------------------------------------------------------

export type ScoreMetric = 'views' | 'reach' | 'likes' | 'comments' | 'shares' | 'saves' | 'engagementRate';

const SCORE_WEIGHTS: Record<ScoreMetric, number> = {
	views: 0.2,
	reach: 0.1,
	likes: 0.15,
	comments: 0.15,
	shares: 0.15,
	saves: 0.15,
	engagementRate: 0.1,
};

export const SCORE_DEFINITION =
	'Performance score (0–100): for each metric Instagram returned (views, reach, likes, comments, shares, saves, engagement rate), the post’s percentile among your synced posts that have that metric, combined with fixed weights (views 20%; likes, comments, shares, saves 15% each; reach, engagement rate 10% each). Metrics that are not available for a post are left out and the remaining weights are rescaled. 50 = a typical post for this account; it compares posts within your account only.';

function metricOf(post: IntelligencePost, metric: ScoreMetric): number | null {
	return metric === 'engagementRate' ? post.engagementRate : post.metrics[metric];
}

export interface PostScore {
	score: number | null;
	/** Metrics the score was computed from. */
	basis: ScoreMetric[];
	/** Percentile (0–100) per metric used. */
	percentiles: Partial<Record<ScoreMetric, number>>;
}

/** Percentile scores for every post. A metric needs MIN_POSTS_FOR_RANKING posts with values to count. */
export function computeScores(posts: IntelligencePost[]): Map<string, PostScore> {
	const sortedByMetric = new Map<ScoreMetric, number[]>();
	for (const metric of Object.keys(SCORE_WEIGHTS) as ScoreMetric[]) {
		const values = present(posts.map((p) => metricOf(p, metric))).sort((a, b) => a - b);
		if (values.length >= MIN_POSTS_FOR_RANKING) sortedByMetric.set(metric, values);
	}
	/** First index whose value is >= (or > when `strict`) the target. */
	const bound = (sorted: number[], value: number, strict: boolean) => {
		let lo = 0;
		let hi = sorted.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (sorted[mid] < value || (strict && sorted[mid] === value)) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	};
	// Mid-rank percentile: ties share the same value.
	const percentile = (sorted: number[], value: number) => {
		const below = bound(sorted, value, false);
		const equal = bound(sorted, value, true) - below;
		return ((below + equal / 2) / sorted.length) * 100;
	};

	const result = new Map<string, PostScore>();
	for (const post of posts) {
		let weighted = 0;
		let weights = 0;
		const basis: ScoreMetric[] = [];
		const percentiles: Partial<Record<ScoreMetric, number>> = {};
		for (const [metric, sorted] of sortedByMetric) {
			const value = metricOf(post, metric);
			if (value === null) continue;
			const p = percentile(sorted, value);
			percentiles[metric] = Math.round(p);
			weighted += p * SCORE_WEIGHTS[metric];
			weights += SCORE_WEIGHTS[metric];
			basis.push(metric);
		}
		result.set(post.id, { score: weights > 0 ? Math.round(weighted / weights) : null, basis, percentiles });
	}
	return result;
}

// ---- Context shared by the analyses ---------------------------------------------------------

export interface ScoredPost extends IntelligencePost {
	score: number | null;
	scoreBasis: ScoreMetric[];
	/** Reels average watch time in ms (Instagram insight); null when not returned. */
	avgWatchTimeMs: number | null;
	/** Video length in seconds (YouTube contentDetails.duration); null when the platform does not report it. */
	durationSeconds: number | null;
}

export interface AnalyticsContext {
	posts: ScoredPost[];
	platform: Platform;
	timeZone: string;
	now: number;
}

export function buildAnalyticsContext(posts: IntelligencePost[], rows: ContentRow[], timeZone: string, now: number, platform: Platform = 'instagram'): AnalyticsContext {
	const scores = computeScores(posts);
	const extras = new Map(rows.map((r) => [r.id, r.extra_metrics]));
	const extra = (id: string, key: string) => {
		const value = extras.get(id)?.[key];
		return typeof value === 'number' ? value : null;
	};
	return {
		platform,
		timeZone,
		now,
		posts: posts.map((post) => {
			const s = scores.get(post.id);
			return { ...post, score: s?.score ?? null, scoreBasis: s?.basis ?? [], avgWatchTimeMs: extra(post.id, 'avgWatchTimeMs'), durationSeconds: extra(post.id, 'durationSeconds') };
		}),
	};
}

function isSettled(post: IntelligencePost, now: number): boolean {
	return post.publishedAt !== null && now - Date.parse(post.publishedAt) >= NEW_POST_MS;
}

// ---- Dashboard ------------------------------------------------------------------------------

export interface MetricTotal {
	/** Sum over posts that have the metric; null when no post has it. */
	total: number | null;
	/** Mean per post over posts that have the metric. */
	average: number | null;
	/** Median per post (the typical post; not lifted by a few viral posts). */
	median: number | null;
	/** Posts that have the metric (the rest: not available from the platform). */
	postsWithData: number;
}

function metricTotal(values: Array<number | null>): MetricTotal {
	const list = present(values);
	return {
		total: list.length ? list.reduce((a, b) => a + b, 0) : null,
		average: list.length ? round(mean(list) as number, 1) : null,
		median: list.length ? round(median(list) as number, 1) : null,
		postsWithData: list.length,
	};
}

export interface DashboardSummary {
	totalPosts: number;
	views: MetricTotal;
	likes: MetricTotal;
	comments: MetricTotal;
	shares: MetricTotal;
	saves: MetricTotal;
	reach: MetricTotal;
	/** Mean engagement rate per post (interactions ÷ followers × 100). */
	engagementRate: { average: number | null; median: number | null; postsWithData: number };
	bestPost: ScoredPost | null;
}

export function computeDashboardSummary(ctx: AnalyticsContext): DashboardSummary {
	const { posts } = ctx;
	const er = present(posts.map((p) => p.engagementRate));
	const best = posts.filter((p) => p.score !== null).sort((a, b) => (b.score as number) - (a.score as number) || (b.interactions ?? 0) - (a.interactions ?? 0))[0] ?? null;
	return {
		totalPosts: posts.length,
		views: metricTotal(posts.map((p) => p.metrics.views)),
		likes: metricTotal(posts.map((p) => p.metrics.likes)),
		comments: metricTotal(posts.map((p) => p.metrics.comments)),
		shares: metricTotal(posts.map((p) => p.metrics.shares)),
		saves: metricTotal(posts.map((p) => p.metrics.saves)),
		reach: metricTotal(posts.map((p) => p.metrics.reach)),
		engagementRate: { average: er.length ? round(mean(er) as number, 2) : null, median: er.length ? round(median(er) as number, 2) : null, postsWithData: er.length },
		bestPost: best,
	};
}

// ---- Trends over time ------------------------------------------------------------------------

/** Per period: the typical (median) post, so one viral post does not make a whole month look strong. */
export interface TrendPoint {
	/** Start of the period (UTC date, YYYY-MM-DD). */
	periodStart: string;
	posts: number;
	views: number | null;
	likes: number | null;
	comments: number | null;
	engagementRate: number | null;
	score: number | null;
}

export interface PerformanceTrend {
	granularity: 'week' | 'month';
	points: TrendPoint[];
}

function weekStart(date: Date): string {
	const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
	d.setUTCDate(d.getUTCDate() - offset);
	return d.toISOString().slice(0, 10);
}

function monthStart(date: Date): string {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function groupBy<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const item of items) {
		const k = key(item);
		if (k === null) continue;
		const list = map.get(k) ?? [];
		list.push(item);
		map.set(k, list);
	}
	return map;
}

function avgOf(posts: ScoredPost[], pick: (p: ScoredPost) => number | null, digits = 1): number | null {
	const m = mean(present(posts.map(pick)));
	return m === null ? null : round(m, digits);
}

function typicalOf(posts: ScoredPost[], pick: (p: ScoredPost) => number | null, digits = 1): number | null {
	const m = medianOf(posts.map(pick));
	return m === null ? null : round(m, digits);
}

/** Weekly points when the history spans up to 26 weeks, monthly otherwise (most recent 36 months). */
export function computePerformanceTrend(ctx: AnalyticsContext): PerformanceTrend {
	const dated = ctx.posts.filter((p) => p.publishedAt !== null);
	if (dated.length === 0) return { granularity: 'week', points: [] };
	const times = dated.map((p) => Date.parse(p.publishedAt as string));
	const span = Math.max(...times) - Math.min(...times);
	const granularity = span <= 26 * 7 * DAY_MS ? 'week' : 'month';
	const groups = groupBy(dated, (p) => (granularity === 'week' ? weekStart(new Date(p.publishedAt as string)) : monthStart(new Date(p.publishedAt as string))));
	const points = [...groups.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.slice(granularity === 'month' ? -36 : -26)
		.map(([periodStart, group]) => ({
			periodStart,
			posts: group.length,
			views: typicalOf(group, (p) => p.metrics.views, 0),
			likes: typicalOf(group, (p) => p.metrics.likes, 0),
			comments: typicalOf(group, (p) => p.metrics.comments, 1),
			engagementRate: typicalOf(group, (p) => p.engagementRate, 2),
			score: typicalOf(group, (p) => p.score, 0),
		}));
	return { granularity, points };
}

export interface FrequencyBucket {
	label: string;
	/** Weeks in which this many posts were published. */
	weeks: number;
	posts: number;
	avgScore: number | null;
	/** Median per post in those weeks. */
	typicalViewsPerPost: number | null;
	typicalInteractionsPerPost: number | null;
}

const FREQUENCY_BUCKETS: Array<{ label: string; min: number; max: number }> = [
	{ label: '1 post/week', min: 1, max: 1 },
	{ label: '2 posts/week', min: 2, max: 2 },
	{ label: '3–4 posts/week', min: 3, max: 4 },
	{ label: '5+ posts/week', min: 5, max: Infinity },
];

/** Per-post performance in weeks with different posting frequency (weeks with no posts are not counted). */
export function computeFrequencyPerformance(ctx: AnalyticsContext): FrequencyBucket[] {
	const settled = ctx.posts.filter((p) => isSettled(p, ctx.now));
	const weeks = groupBy(settled, (p) => weekStart(new Date(p.publishedAt as string)));
	return FREQUENCY_BUCKETS.map((bucket) => {
		const inBucket = [...weeks.values()].filter((w) => w.length >= bucket.min && w.length <= bucket.max);
		const posts = inBucket.flat();
		return {
			label: bucket.label,
			weeks: inBucket.length,
			posts: posts.length,
			avgScore: avgOf(posts, (p) => p.score, 0),
			typicalViewsPerPost: typicalOf(posts, (p) => p.metrics.views, 0),
			typicalInteractionsPerPost: typicalOf(posts, (p) => p.interactions, 1),
		};
	}).filter((b) => b.weeks > 0);
}

// ---- Heat maps & posting-time recommendation -----------------------------------------------

export type HeatmapMetric = 'score' | 'views' | 'likes' | 'engagementRate' | 'interactions';

const HEATMAP_PICK: Record<HeatmapMetric, (p: ScoredPost) => number | null> = {
	score: (p) => p.score,
	views: (p) => p.metrics.views,
	likes: (p) => p.metrics.likes,
	engagementRate: (p) => p.engagementRate,
	interactions: (p) => p.interactions,
};

export interface HeatmapCell {
	dayOfWeek: number;
	startHour: number;
	endHour: number;
	postCount: number;
	/** Median per post in the cell. */
	median: number;
	/** 0–100 relative to the strongest measured cell. */
	intensity: number;
}

export interface MetricHeatmap {
	metric: HeatmapMetric;
	sufficient: boolean;
	postsAnalyzed: number;
	minimumRequired: number;
	cells: HeatmapCell[];
	/** Median per weekday (0 = Monday), days with posts only. */
	byDay: Array<{ dayOfWeek: number; postCount: number; median: number }>;
	/** Median per 3-hour block across all days. */
	byHour: Array<{ startHour: number; endHour: number; postCount: number; median: number }>;
}

const MIN_POSTS_PER_CELL = 2;

interface Located {
	post: ScoredPost;
	day: number;
	block: number;
}

function locate(ctx: AnalyticsContext): Located[] {
	const out: Located[] = [];
	for (const post of ctx.posts) {
		if (!post.publishedAt || !isSettled(post, ctx.now)) continue;
		const local = localDayHour(post.publishedAt, ctx.timeZone);
		if (local) out.push({ post, day: local.dayOfWeek, block: Math.floor(local.hour / BLOCK_HOURS) * BLOCK_HOURS });
	}
	return out;
}

export function computeHeatmap(ctx: AnalyticsContext, metric: HeatmapMetric): MetricHeatmap {
	const pick = HEATMAP_PICK[metric];
	const located = locate(ctx).filter((l) => pick(l.post) !== null);
	const base: MetricHeatmap = { metric, sufficient: false, postsAnalyzed: located.length, minimumRequired: MIN_POSTS_FOR_TIMING, cells: [], byDay: [], byHour: [] };
	if (located.length < MIN_POSTS_FOR_TIMING) return base;

	const aggregate = (groups: Map<string, Located[]>) =>
		[...groups.entries()].map(([key, list]) => ({ key, postCount: list.length, value: median(list.map((l) => pick(l.post) as number)) as number }));

	const cells = aggregate(groupBy(located, (l) => `${l.day}:${l.block}`)).filter((c) => c.postCount >= MIN_POSTS_PER_CELL);
	const best = Math.max(0, ...cells.map((c) => c.value));
	return {
		...base,
		sufficient: true,
		cells: cells.map((c) => {
			const [day, block] = c.key.split(':').map(Number);
			return {
				dayOfWeek: day,
				startHour: block,
				endHour: block + BLOCK_HOURS,
				postCount: c.postCount,
				median: round(c.value, metric === 'engagementRate' ? 2 : 1),
				intensity: best > 0 ? Math.round((c.value / best) * 100) : 0,
			};
		}),
		byDay: aggregate(groupBy(located, (l) => String(l.day)))
			.map((d) => ({ dayOfWeek: Number(d.key), postCount: d.postCount, median: round(d.value, metric === 'engagementRate' ? 2 : 1) }))
			.sort((a, b) => a.dayOfWeek - b.dayOfWeek),
		byHour: aggregate(groupBy(located, (l) => String(l.block)))
			.map((h) => ({ startHour: Number(h.key), endHour: Number(h.key) + BLOCK_HOURS, postCount: h.postCount, median: round(h.value, metric === 'engagementRate' ? 2 : 1) }))
			.sort((a, b) => a.startHour - b.startHour),
	};
}

export type Confidence = 'high' | 'medium' | 'low';

export interface MetricLift {
	metric: 'views' | 'likes' | 'engagementRate' | 'interactions';
	/** Median per post in the slot. */
	groupMedian: number;
	/** Median per post across all analyzed posts. */
	accountMedian: number;
	/** groupMedian ÷ accountMedian */
	ratio: number;
}

export interface TimingSlot {
	postCount: number;
	avgScore: number;
	/** Share of posts in the slot that scored above the account's median score. */
	hitRate: number;
	lifts: MetricLift[];
}

export interface PostingRecommendation {
	sufficient: boolean;
	timezone: string;
	postsAnalyzed: number;
	minimumRequired: number;
	accountAvgScore: number | null;
	bestDay: (TimingSlot & { dayOfWeek: number; label: string }) | null;
	bestTime: (TimingSlot & { startHour: number; endHour: number; label: string }) | null;
	/** Best single day + time cell, when it has enough posts. */
	bestSlot: (TimingSlot & { dayOfWeek: number; startHour: number; endHour: number; label: string }) | null;
	/** Metrics clearly above average in the recommended window. */
	strongMetrics: string[];
	confidence: Confidence;
	/** Plain explanation with the measured numbers. */
	why: string[];
}

const MIN_POSTS_PER_DAY_GROUP = 4;
const MIN_POSTS_PER_SLOT = 3;

function slotStats(group: Located[], all: Located[], medianScore: number): TimingSlot {
	const lifts: MetricLift[] = [];
	for (const metric of ['views', 'likes', 'engagementRate', 'interactions'] as const) {
		const pick = HEATMAP_PICK[metric];
		const groupValues = present(group.map((l) => pick(l.post)));
		const allValues = present(all.map((l) => pick(l.post)));
		const g = median(groupValues);
		const a = median(allValues);
		if (g === null || a === null || a <= 0 || groupValues.length < 2) continue;
		lifts.push({ metric, groupMedian: round(g, 2), accountMedian: round(a, 2), ratio: round(g / a, 2) });
	}
	const scores = group.map((l) => l.post.score as number);
	return {
		postCount: group.length,
		avgScore: Math.round(mean(scores) as number),
		hitRate: round(scores.filter((s) => s > medianScore).length / scores.length, 2),
		lifts,
	};
}

function confidenceOf(slot: TimingSlot, accountAvgScore: number): Confidence {
	const lift = slot.avgScore - accountAvgScore;
	if (slot.postCount >= 10 && lift >= 10 && slot.hitRate >= 0.6) return 'high';
	if (slot.postCount >= 6 && lift >= 5 && slot.hitRate >= 0.5) return 'medium';
	return 'low';
}

const METRIC_NAMES: Record<MetricLift['metric'], string> = { views: 'views', likes: 'likes', engagementRate: 'engagement rate', interactions: 'interactions' };

export function computePostingRecommendation(ctx: AnalyticsContext): PostingRecommendation {
	const located = locate(ctx).filter((l) => l.post.score !== null);
	const base: PostingRecommendation = {
		sufficient: false,
		timezone: ctx.timeZone,
		postsAnalyzed: located.length,
		minimumRequired: MIN_POSTS_FOR_TIMING,
		accountAvgScore: null,
		bestDay: null,
		bestTime: null,
		bestSlot: null,
		strongMetrics: [],
		confidence: 'low',
		why: [],
	};
	if (located.length < MIN_POSTS_FOR_TIMING) return base;

	const scores = located.map((l) => l.post.score as number);
	const accountAvgScore = Math.round(mean(scores) as number);
	const medianScore = median(scores) as number;
	const best = <K>(groups: Map<string, Located[]>, min: number, build: (key: string, list: Located[]) => K & TimingSlot) =>
		[...groups.entries()]
			.filter(([, list]) => list.length >= min)
			.map(([key, list]) => build(key, list))
			.sort((a, b) => b.avgScore - a.avgScore || b.postCount - a.postCount)[0] ?? null;

	const bestDay = best(groupBy(located, (l) => String(l.day)), MIN_POSTS_PER_DAY_GROUP, (key, list) => ({
		dayOfWeek: Number(key),
		label: DAY_NAMES[Number(key)],
		...slotStats(list, located, medianScore),
	}));
	const bestTime = best(groupBy(located, (l) => String(l.block)), MIN_POSTS_PER_DAY_GROUP, (key, list) => ({
		startHour: Number(key),
		endHour: Number(key) + BLOCK_HOURS,
		label: windowLabel(Number(key), Number(key) + BLOCK_HOURS),
		...slotStats(list, located, medianScore),
	}));
	const bestSlot = best(groupBy(located, (l) => `${l.day}:${l.block}`), MIN_POSTS_PER_SLOT, (key, list) => {
		const [day, block] = key.split(':').map(Number);
		return { dayOfWeek: day, startHour: block, endHour: block + BLOCK_HOURS, label: `${DAY_NAMES[day]}, ${windowLabel(block, block + BLOCK_HOURS)}`, ...slotStats(list, located, medianScore) };
	});

	const lead = bestTime ?? bestDay;
	const strongLifts = lead ? lead.lifts.filter((l) => l.ratio >= 1.1) : [];
	// Interactions are likes + comments: listed only when likes are not already there.
	const strongMetrics = strongLifts.filter((l) => l.metric !== 'interactions' || !strongLifts.some((x) => x.metric === 'likes')).map((l) => METRIC_NAMES[l.metric]);
	const confidences = [bestDay, bestTime].filter((s): s is NonNullable<typeof s> => s !== null).map((s) => confidenceOf(s, accountAvgScore));
	const confidence: Confidence = confidences.includes('high') && !confidences.includes('low') ? 'high' : confidences.some((c) => c !== 'low') ? 'medium' : 'low';

	const why: string[] = [];
	const describeSlot = (name: string, slot: TimingSlot) => {
		const views = slot.lifts.find((l) => l.metric === 'views');
		const er = slot.lifts.find((l) => l.metric === 'engagementRate');
		const parts = [`${slot.postCount} posts published ${name} averaged a performance score of ${slot.avgScore} (account average ${accountAvgScore})`];
		if (views) parts.push(`a typical ${compact(views.groupMedian)} views per post vs ${compact(views.accountMedian)} overall (${describeRatio(views.ratio)})`);
		if (er) parts.push(`typical engagement rate ${pct(er.groupMedian)} vs ${pct(er.accountMedian)}`);
		why.push(`${parts.join('; ')}. ${Math.round(slot.hitRate * slot.postCount)} of ${slot.postCount} beat your median post.`);
	};
	if (bestDay) describeSlot(`on ${bestDay.label}s`, bestDay);
	if (bestTime) describeSlot(`between ${bestTime.label}`, bestTime);
	if (confidence === 'low') why.push('The difference is small or based on few posts, so treat this as a time to test, not a rule.');

	return { ...base, sufficient: true, accountAvgScore, bestDay, bestTime, bestSlot, strongMetrics, confidence, why };
}

// ---- Per-post reasons (observed) -------------------------------------------------------------

export interface ObservedReason {
	id: string;
	/** What the reason is about (shown as a chip). */
	area: 'views' | 'engagement' | 'format' | 'shares_saves' | 'comments' | 'timing' | 'caption' | 'hashtags' | 'watch_time' | 'topic';
	direction: 'positive' | 'negative';
	statement: string;
	/** Relative strength used for ordering (|ratio − 1|). */
	magnitude: number;
}

export interface Improvement {
	area: ObservedReason['area'];
	action: string;
	/** Why this action, from the account's own data. */
	basis: string;
}

export interface PostComparisons {
	account: ComparisonSet;
	similar: ComparisonSet & { format: ContentFormat };
	best: ComparisonSet;
}

/** The typical (median) post of a group; null = no post in the group has the metric. */
export interface ComparisonSet {
	postCount: number;
	views: number | null;
	likes: number | null;
	comments: number | null;
	shares: number | null;
	saves: number | null;
	engagementRate: number | null;
	score: number | null;
}

function comparisonSet(posts: ScoredPost[]): ComparisonSet {
	return {
		postCount: posts.length,
		views: typicalOf(posts, (p) => p.metrics.views, 0),
		likes: typicalOf(posts, (p) => p.metrics.likes, 0),
		comments: typicalOf(posts, (p) => p.metrics.comments, 1),
		shares: typicalOf(posts, (p) => p.metrics.shares, 1),
		saves: typicalOf(posts, (p) => p.metrics.saves, 1),
		engagementRate: typicalOf(posts, (p) => p.engagementRate, 2),
		score: typicalOf(posts, (p) => p.score, 0),
	};
}

const BEST_POSTS_SAMPLE = 10;

export function computeComparisons(ctx: AnalyticsContext, post: ScoredPost): PostComparisons {
	const others = ctx.posts.filter((p) => p.id !== post.id);
	const best = others.filter((p) => p.score !== null).sort((a, b) => (b.score as number) - (a.score as number)).slice(0, BEST_POSTS_SAMPLE);
	return {
		account: comparisonSet(others),
		similar: { ...comparisonSet(others.filter((p) => p.format === post.format)), format: post.format },
		best: comparisonSet(best),
	};
}

function captionLength(post: IntelligencePost): number {
	return post.caption ? [...post.caption].length : 0;
}

function hashtagCount(post: IntelligencePost): number {
	return (post.caption?.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
}

function hashtagsOf(post: IntelligencePost): string[] {
	return [...new Set((post.caption?.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.toLowerCase()))];
}

const CAPTION_BUCKETS = [
	{ id: 'short', label: 'short captions (under 80 characters)', min: 0, max: 79 },
	{ id: 'medium', label: 'medium captions (80–300 characters)', min: 80, max: 300 },
	{ id: 'long', label: 'long captions (over 300 characters)', min: 301, max: Infinity },
] as const;

const HASHTAG_BUCKETS = [
	{ id: 'none', label: 'no hashtags', min: 0, max: 0 },
	{ id: 'few', label: '1–3 hashtags', min: 1, max: 3 },
	{ id: 'some', label: '4–10 hashtags', min: 4, max: 10 },
	{ id: 'many', label: 'more than 10 hashtags', min: 11, max: Infinity },
] as const;

function bucketOf<B extends { min: number; max: number }>(buckets: readonly B[], value: number): B {
	return buckets.find((b) => value >= b.min && value <= b.max) as B;
}

function ratio(value: number | null, reference: number | null): number | null {
	return value === null || reference === null || reference <= 0 ? null : value / reference;
}

/**
 * Measured reasons a post did well or badly, compared with the account's own posts. Only facts
 * with data behind them; `kind` keeps the reasons that explain the post's side (top or improve).
 */
export function explainPost(
	ctx: AnalyticsContext,
	post: ScoredPost,
	kind: 'top' | 'improve',
	recommendation: PostingRecommendation,
	trends: DetectedTrends,
): { reasons: ObservedReason[]; improvements: Improvement[] } {
	const wanted = kind === 'top' ? 'positive' : 'negative';
	const reasons: ObservedReason[] = [];
	const others = ctx.posts.filter((p) => p.id !== post.id);
	const add = (area: ObservedReason['area'], r: number | null, positive: string, negative: string, threshold = 0.15) => {
		if (r === null || Math.abs(r - 1) < threshold) return;
		reasons.push({ id: `${area}_${reasons.length}`, area, direction: r > 1 ? 'positive' : 'negative', statement: r > 1 ? positive : negative, magnitude: Math.abs(r - 1) });
	};
	// Benchmarks are the typical (median) post: a few viral posts would lift a mean far above what most posts get.
	const avg = (pick: (p: ScoredPost) => number | null) => medianOf(others.map(pick));

	// 1. Views vs account average
	const avgViews = avg((p) => p.metrics.views);
	const vr = ratio(post.metrics.views, avgViews);
	if (vr !== null && avgViews !== null && post.metrics.views !== null) {
		add(
			'views',
			vr,
			`${compact(post.metrics.views)} views: ${moreThan(vr, 'views', 'your typical post')} (${compact(avgViews)}).`,
			`${compact(post.metrics.views)} views: ${Math.round((1 - vr) * 100)}% below your typical post (${compact(avgViews)}).`,
		);
	}
	// 2. Engagement rate
	const avgEr = avg((p) => p.engagementRate);
	const err = ratio(post.engagementRate, avgEr);
	if (err !== null && post.engagementRate !== null && avgEr !== null) {
		add(
			'engagement',
			err,
			`Engagement rate ${pct(post.engagementRate)} vs ${pct(avgEr)} for your typical post (${describeRatio(err)}).`,
			`Engagement rate ${pct(post.engagementRate)} is ${Math.round((1 - err) * 100)}% below your typical post (${pct(avgEr)}).`,
		);
	}
	// 3. Similar posts (same format)
	const sameFormat = others.filter((p) => p.format === post.format);
	if (sameFormat.length >= 3) {
		const useViews = post.metrics.views !== null && present(sameFormat.map((p) => p.metrics.views)).length >= 3;
		const pick = (p: IntelligencePost) => (useViews ? p.metrics.views : p.interactions);
		const fr = ratio(pick(post), medianOf(sameFormat.map(pick)));
		const name = formatName(post.format, ctx.platform).one;
		const metric = useViews ? 'views' : 'interactions';
		const reference = `your typical ${name} (${sameFormat.length} compared)`;
		add('format', fr, `Got ${moreThan(fr ?? 1, metric, reference)}.`, `Got ${Math.round((1 - (fr ?? 1)) * 100)}% fewer ${metric} than ${reference}.`);
	}
	// 4. Shares + saves per view (or per reach)
	const ssOf = (p: IntelligencePost) => {
		if (p.metrics.shares === null || p.metrics.saves === null) return null;
		const denom = p.metrics.reach ?? p.metrics.views;
		return denom && denom > 0 ? (p.metrics.shares + p.metrics.saves) / denom : null;
	};
	const ssr = ratio(ssOf(post), medianOf(others.map(ssOf)));
	if (ssr !== null) {
		add('shares_saves', ssr, `Share + save rate is ${describeRatio(ssr)} your typical post: people kept or passed this on.`, `Share + save rate is ${Math.round((1 - ssr) * 100)}% below your typical post: few viewers saved or shared it.`, 0.2);
	}
	// 5. Comments relative to likes (conversation)
	const cOf = (p: IntelligencePost) => (p.metrics.comments !== null && p.metrics.likes ? p.metrics.comments / p.metrics.likes : null);
	const cr = ratio(cOf(post), medianOf(others.map(cOf)));
	if (cr !== null) add('comments', cr, `Comments per like are ${describeRatio(cr)} your typical post: it started a conversation.`, `Comments per like are ${Math.round((1 - cr) * 100)}% below your typical post: it prompted little conversation.`, 0.3);
	// 6. Timing
	if (recommendation.sufficient && post.publishedAt) {
		const local = localDayHour(post.publishedAt, ctx.timeZone);
		const t = recommendation.bestTime;
		const d = recommendation.bestDay;
		if (local && (t || d)) {
			const inTime = t ? local.hour >= t.startHour && local.hour < t.endHour : false;
			const inDay = d ? local.dayOfWeek === d.dayOfWeek : false;
			const when = `${DAY_NAMES[local.dayOfWeek]} at ${hourLabel(local.hour)}`;
			if (inTime || inDay) {
				reasons.push({ id: 'timing', area: 'timing', direction: 'positive', statement: `Published ${when}, inside one of your historically strongest windows (${[inDay && d ? `${d.label}s` : null, inTime && t ? t.label : null].filter(Boolean).join(', ')}).`, magnitude: 0.2 });
			} else {
				reasons.push({ id: 'timing', area: 'timing', direction: 'negative', statement: `Published ${when}, outside your strongest measured windows (${[d ? `${d.label}s` : null, t ? t.label : null].filter(Boolean).join(', ')}).`, magnitude: 0.2 });
			}
		}
	}
	// 7. Reels watch time
	if (post.avgWatchTimeMs !== null) {
		const reels = others.filter((p) => p.avgWatchTimeMs !== null);
		const typicalW = median(reels.map((p) => p.avgWatchTimeMs as number));
		const wr = ratio(post.avgWatchTimeMs, typicalW);
		if (reels.length >= 3 && wr !== null && typicalW !== null) {
			add('watch_time', wr, `Average watch time ${round(post.avgWatchTimeMs / 1000, 1)}s vs ${round(typicalW / 1000, 1)}s for your typical Reel: viewers stayed longer.`, `Average watch time ${round(post.avgWatchTimeMs / 1000, 1)}s vs ${round(typicalW / 1000, 1)}s for your typical Reel: viewers left earlier.`, 0.15);
		}
	}
	// 8. Caption length & hashtags, measured against the account's best-performing buckets
	const captionTrend = trends.trends.find((t) => t.category === 'caption');
	const captionBucket = bucketOf(CAPTION_BUCKETS, captionLength(post));
	if (captionTrend?.bucketId) {
		const matches = captionTrend.bucketId === captionBucket.id;
		reasons.push({
			id: 'caption',
			area: 'caption',
			direction: matches ? 'positive' : 'negative',
			statement: matches
				? `Uses ${captionBucket.label}, the caption length that performs best on this account.`
				: `Uses ${captionBucket.label}; on this account ${captionTrend.bucketLabel} perform better (${captionTrend.headline}).`,
			magnitude: 0.1,
		});
	}
	const hashtagTrend = trends.trends.find((t) => t.category === 'hashtags');
	if (hashtagTrend?.bucketId) {
		const bucket = bucketOf(HASHTAG_BUCKETS, hashtagCount(post));
		const matches = hashtagTrend.bucketId === bucket.id;
		reasons.push({
			id: 'hashtags',
			area: 'hashtags',
			direction: matches ? 'positive' : 'negative',
			statement: matches ? `Uses ${bucket.label}, the hashtag range that performs best here.` : `Uses ${bucket.label}; posts with ${hashtagTrend.bucketLabel} perform better here.`,
			magnitude: 0.08,
		});
	}
	// 9. Topic
	const tags = new Set(hashtagsOf(post));
	const topic = trends.trends.find((t) => t.category === 'topic' && t.direction === 'up' && t.topic && (tags.has(t.topic) || (post.caption ?? '').toLowerCase().includes(t.topic)));
	if (topic?.topic) {
		reasons.push({ id: 'topic', area: 'topic', direction: 'positive', statement: `Covers “${topic.topic}”, one of your strongest recurring topics (${topic.headline}).`, magnitude: 0.25 });
	}

	const directional = reasons.filter((r) => r.direction === wanted).sort((a, b) => b.magnitude - a.magnitude).slice(0, 5);
	const improvements = kind === 'improve' ? suggestImprovements(directional, post, recommendation, trends, ctx.platform) : [];
	return { reasons: directional, improvements };
}

function suggestImprovements(reasons: ObservedReason[], post: ScoredPost, recommendation: PostingRecommendation, trends: DetectedTrends, platform: Platform): Improvement[] {
	const bestFormat = trends.trends.find((t) => t.category === 'format' && t.direction === 'up');
	const out: Improvement[] = [];
	for (const reason of reasons) {
		switch (reason.area) {
			case 'views':
				out.push({ area: 'views', action: 'Make the first 1–2 seconds and the cover state the topic immediately, so the post wins the scroll.', basis: reason.statement });
				break;
			case 'watch_time':
				out.push({ area: 'watch_time', action: 'Shorten the introduction and show the payoff earlier in the video.', basis: reason.statement });
				break;
			case 'shares_saves':
				out.push({ area: 'shares_saves', action: 'Add a save-worthy takeaway (a checklist, steps or a key number) and ask viewers to save or send it.', basis: reason.statement });
				break;
			case 'comments':
				out.push({ area: 'comments', action: 'End with a specific question or a choice viewers can answer in one word.', basis: reason.statement });
				break;
			case 'timing':
				if (recommendation.bestDay || recommendation.bestTime) {
					out.push({ area: 'timing', action: `Publish similar content ${[recommendation.bestDay ? `on ${recommendation.bestDay.label}` : null, recommendation.bestTime ? `between ${recommendation.bestTime.label}` : null].filter(Boolean).join(' ')} (${recommendation.timezone}).`, basis: reason.statement });
				}
				break;
			case 'format':
				if (bestFormat?.format && bestFormat.format !== post.format) {
					out.push({ area: 'format', action: `Test this topic as a ${formatName(bestFormat.format, platform).one}.`, basis: `${reason.statement} ${bestFormat.headline}.` });
				}
				break;
			case 'caption': {
				const t = trends.trends.find((x) => x.category === 'caption');
				if (t) out.push({ area: 'caption', action: `Try ${t.bucketLabel}.`, basis: reason.statement });
				break;
			}
			case 'hashtags': {
				const t = trends.trends.find((x) => x.category === 'hashtags');
				if (t) out.push({ area: 'hashtags', action: `Use ${t.bucketLabel}.`, basis: reason.statement });
				break;
			}
			case 'engagement':
				out.push({ area: 'engagement', action: 'Give viewers a reason to react: a clear opinion, a before/after, or a direct call to action.', basis: reason.statement });
				break;
			default:
				break;
		}
	}
	return out.slice(0, 5);
}

// ---- Top performers / needs improvement -------------------------------------------------------

export function topPerformers(ctx: AnalyticsContext): ScoredPost[] {
	return ctx.posts.filter((p) => p.score !== null).sort((a, b) => (b.score as number) - (a.score as number) || (b.interactions ?? 0) - (a.interactions ?? 0));
}

/** Lowest scores among posts old enough to have collected their engagement. */
export function needsImprovement(ctx: AnalyticsContext): ScoredPost[] {
	return ctx.posts
		.filter((p) => p.score !== null && isSettled(p, ctx.now))
		.sort((a, b) => (a.score as number) - (b.score as number) || (a.interactions ?? 0) - (b.interactions ?? 0));
}

// ---- Trend detection ------------------------------------------------------------------------

export interface Evidence {
	label: string;
	value: string;
}

export interface DetectedTrend {
	id: string;
	category: 'format' | 'format_momentum' | 'momentum' | 'caption' | 'hashtags' | 'length' | 'topic' | 'timing' | 'watch_time' | 'frequency';
	direction: 'up' | 'down';
	/** One sentence with the measured numbers. */
	headline: string;
	/** Rule-based next step derived from the measurement. */
	recommendation: string;
	/** group ÷ comparison on the metric named in `metric`. */
	ratio: number;
	metric: string;
	sampleSize: number;
	comparisonSize: number;
	confidence: Confidence;
	evidence: Evidence[];
	format?: ContentFormat;
	topic?: string;
	bucketId?: string;
	bucketLabel?: string;
}

export interface DetectedTrends {
	postsAnalyzed: number;
	sufficient: boolean;
	minimumRequired: number;
	trends: DetectedTrend[];
	/** Analyses the platform's data cannot support, and why. */
	unavailable: Array<{ topic: string; reason: string }>;
}

function trendConfidence(n: number, m: number, r: number): Confidence {
	const smaller = Math.min(n, m);
	const strength = Math.abs(r - 1);
	if (smaller >= 10 && strength >= 0.3) return 'high';
	if (smaller >= 5 && strength >= 0.2) return 'medium';
	return 'low';
}

/** Views when enough posts on both sides have views, interactions otherwise. */
function compareGroups(group: ScoredPost[], rest: ScoredPost[], minEach: number) {
	for (const [metric, pick] of [
		['views', (p: ScoredPost) => p.metrics.views],
		['interactions', (p: ScoredPost) => p.interactions],
	] as const) {
		const g = present(group.map(pick));
		const r = present(rest.map(pick));
		if (g.length >= minEach && r.length >= minEach) {
			const gm = median(g) as number;
			const rm = median(r) as number;
			if (rm > 0) return { metric, groupAvg: gm, restAvg: rm, ratio: gm / rm, n: g.length, m: r.length };
		}
	}
	return null;
}

/** Sorted values of the whole analyzed set, per comparison metric. */
interface MetricTotals {
	views: number[];
	interactions: number[];
}

const COMPARE_PICK = { views: (p: ScoredPost) => p.metrics.views, interactions: (p: ScoredPost) => p.interactions } as const;

function totalsOf(posts: ScoredPost[]): MetricTotals {
	return {
		views: present(posts.map(COMPARE_PICK.views)).sort((a, b) => a - b),
		interactions: present(posts.map(COMPARE_PICK.interactions)).sort((a, b) => a - b),
	};
}

/** Median of `sortedAll` with the values in `exclude` (a sub-multiset of it) removed, in one pass. */
function medianExcluding(sortedAll: number[], exclude: number[]): number | null {
	const n = sortedAll.length - exclude.length;
	if (n <= 0) return null;
	const remove = new Map<number, number>();
	for (const v of exclude) remove.set(v, (remove.get(v) ?? 0) + 1);
	const lo = Math.floor((n - 1) / 2);
	const hi = Math.floor(n / 2);
	let index = 0;
	let a = 0;
	for (const v of sortedAll) {
		const r = remove.get(v);
		if (r) {
			remove.set(v, r - 1);
			continue;
		}
		if (index === lo) a = v;
		if (index === hi) return (a + v) / 2;
		index++;
	}
	return null;
}

/**
 * Same result as compareGroups(group, all − group), using the pre-sorted values of `all` (topic
 * detection compares thousands of candidate groups against the rest of the history).
 */
function compareToRest(group: ScoredPost[], all: MetricTotals, minEach: number) {
	for (const metric of ['views', 'interactions'] as const) {
		const values = present(group.map(COMPARE_PICK[metric]));
		const n = values.length;
		const m = all[metric].length - n;
		if (n >= minEach && m >= minEach) {
			const groupAvg = median(values) as number;
			const restAvg = medianExcluding(all[metric], values) as number;
			if (restAvg > 0) return { metric, groupAvg, restAvg, ratio: groupAvg / restAvg, n, m };
		}
	}
	return null;
}

function topicRank(t: { topic: string; cmp: { ratio: number; n: number } }): number {
	return t.cmp.ratio * Math.sqrt(t.cmp.n) * (t.topic.startsWith('#') ? 1.15 : 1);
}

// Generic caption words that are not topics ("5-minute", "step by step", "tips").
const GENERIC_WORDS = 'minute minutes hour hours second seconds step steps tips tip part parts guide easy best quick simple ideas idea thing things week weekend year years first last next really still back look looking love loved getting going share follow comment comments link bio check video videos post posts reel reels photo photos story stories'.split(' ');

const STOPWORDS = new Set(
	'this that with from your have will what when where which their there about just more than them they into some like been were make made only over also very much here know want need dont cant youre its it’s our ours yours mine then thats these those them because while would could should after before every each being even most many such ever how why who out for and the you are not but all can get got one two new now day today time see use way'.split(' '),
);

function keywordsOf(post: IntelligencePost): string[] {
	const text = (post.caption ?? '').toLowerCase().replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/@[\w.]+/g, ' ');
	const words = text.match(/\p{L}{4,}/gu) ?? [];
	return [...new Set(words.filter((w) => !STOPWORDS.has(w) && !GENERIC_WORDS.includes(w)))];
}

const MIN_POSTS_FOR_TRENDS = MIN_POSTS_FOR_RANKING * 2;

/** What each platform's API cannot tell us, stated instead of guessed. */
const UNAVAILABLE: Record<Platform, Array<{ topic: string; reason: string }>> = {
	instagram: [
		{ topic: 'Video length', reason: 'Instagram’s API does not return video duration, so length patterns cannot be measured.' },
		{ topic: 'Audio and trending sounds', reason: 'Instagram’s API does not say which audio a post uses.' },
	],
	facebook: [
		{ topic: 'Video length', reason: 'Video duration is not part of the Page post data Media Navigator reads.' },
		{ topic: 'Audio', reason: 'Facebook’s API does not say which audio a post uses.' },
	],
	youtube: [
		{ topic: 'Shorts vs long-form', reason: 'YouTube’s API has no field that identifies Shorts, so videos are not split into Shorts and long-form.' },
		{ topic: 'Audio', reason: 'YouTube’s API does not say which music or sound a video uses.' },
	],
	linkedin: [{ topic: 'Video length', reason: 'LinkedIn’s post statistics do not include video duration.' }],
};

const LENGTH_BUCKETS = [
	{ id: 'under_1m', label: 'videos under 1 minute', min: 0, max: 59 },
	{ id: '1_3m', label: 'videos of 1–3 minutes', min: 60, max: 180 },
	{ id: '3_10m', label: 'videos of 3–10 minutes', min: 181, max: 600 },
	{ id: '10_20m', label: 'videos of 10–20 minutes', min: 601, max: 1200 },
	{ id: 'over_20m', label: 'videos over 20 minutes', min: 1201, max: Infinity },
] as const;

export function detectTrends(ctx: AnalyticsContext, recommendation: PostingRecommendation): DetectedTrends {
	const settled = ctx.posts.filter((p) => isSettled(p, ctx.now) && (p.interactions !== null || p.metrics.views !== null));
	const result: DetectedTrends = {
		postsAnalyzed: settled.length,
		sufficient: settled.length >= MIN_POSTS_FOR_TRENDS,
		minimumRequired: MIN_POSTS_FOR_TRENDS,
		trends: [],
		unavailable: UNAVAILABLE[ctx.platform],
	};
	if (!result.sufficient) return result;
	const trends = result.trends;
	const settledTotals = totalsOf(settled);
	const metricLabel = (m: string) => (m === 'views' ? 'views' : 'interactions (likes + comments)');

	// Formats
	const byFormat = CONTENT_FORMATS.map((format) => ({ format, posts: settled.filter((p) => p.format === format) })).filter((f) => f.posts.length >= 5);
	if (byFormat.length >= 2) {
		const compared = byFormat
			.map((f) => ({ ...f, cmp: compareToRest(f.posts, settledTotals, 5) }))
			.filter((f): f is typeof f & { cmp: NonNullable<typeof f.cmp> } => f.cmp !== null)
			.sort((a, b) => b.cmp.ratio - a.cmp.ratio);
		const top = compared[0];
		if (top && top.cmp.ratio >= 1.2) {
			const name = formatName(top.format, ctx.platform).many;
			const share = top.posts.length / settled.length;
			trends.push({
				id: `format_${top.format}`,
				category: 'format',
				direction: 'up',
				format: top.format,
				headline: `${name} get ${moreThan(top.cmp.ratio, metricLabel(top.cmp.metric), 'your other formats')} (${compact(top.cmp.groupAvg)} vs ${compact(top.cmp.restAvg)} per post)`,
				recommendation:
					share < 0.5
						? `${name} are ${Math.round(share * 100)}% of your posts. Make the next 3–5 posts ${name.toLowerCase()} on topics that already work for you.`
						: `Keep ${name.toLowerCase()} as your main format and test variations of your best ones.`,
				ratio: round(top.cmp.ratio, 2),
				metric: top.cmp.metric,
				sampleSize: top.cmp.n,
				comparisonSize: top.cmp.m,
				confidence: trendConfidence(top.cmp.n, top.cmp.m, top.cmp.ratio),
				evidence: [
					{ label: `Typical ${name.toLowerCase()} (${top.cmp.metric})`, value: compact(top.cmp.groupAvg) },
					{ label: `Typical other post (${top.cmp.metric})`, value: compact(top.cmp.restAvg) },
					{ label: `${name} analyzed`, value: String(top.cmp.n) },
				],
			});
		}
		const bottom = compared[compared.length - 1];
		if (bottom && bottom !== top && bottom.cmp.ratio <= 0.75) {
			const name = formatName(bottom.format, ctx.platform).many;
			trends.push({
				id: `format_low_${bottom.format}`,
				category: 'format',
				direction: 'down',
				format: bottom.format,
				headline: `${name} get ${Math.round((1 - bottom.cmp.ratio) * 100)}% fewer ${metricLabel(bottom.cmp.metric)} than your other formats (${compact(bottom.cmp.groupAvg)} vs ${compact(bottom.cmp.restAvg)})`,
				recommendation: `Publish fewer ${name.toLowerCase()}, or rework their opening, until they close the gap.`,
				ratio: round(bottom.cmp.ratio, 2),
				metric: bottom.cmp.metric,
				sampleSize: bottom.cmp.n,
				comparisonSize: bottom.cmp.m,
				confidence: trendConfidence(bottom.cmp.n, bottom.cmp.m, bottom.cmp.ratio),
				evidence: [
					{ label: `Typical ${name.toLowerCase()} (${bottom.cmp.metric})`, value: compact(bottom.cmp.groupAvg) },
					{ label: `Typical other post (${bottom.cmp.metric})`, value: compact(bottom.cmp.restAvg) },
				],
			});
		}
	}

	// Format momentum: last 90 days vs before, per format
	const recentCut = ctx.now - 90 * DAY_MS;
	for (const { format, posts } of byFormat) {
		const recent = posts.filter((p) => Date.parse(p.publishedAt as string) >= recentCut);
		const older = posts.filter((p) => Date.parse(p.publishedAt as string) < recentCut);
		const cmp = compareGroups(recent, older, 4);
		if (!cmp || (cmp.ratio > 0.7 && cmp.ratio < 1.4)) continue;
		const name = formatName(format, ctx.platform).many;
		const up = cmp.ratio >= 1.4;
		trends.push({
			id: `format_momentum_${format}`,
			category: 'format_momentum',
			direction: up ? 'up' : 'down',
			format,
			headline: up
				? `${name} are rising: the typical post of the last 90 days gets ${compact(cmp.groupAvg)} ${cmp.metric} vs ${compact(cmp.restAvg)} before (${describeRatio(cmp.ratio)})`
				: `${name} are declining: the typical post of the last 90 days gets ${compact(cmp.groupAvg)} ${cmp.metric} vs ${compact(cmp.restAvg)} before (−${Math.round((1 - cmp.ratio) * 100)}%)`,
			recommendation: up ? `Lean into ${name.toLowerCase()} while they are gaining.` : `Compare your recent ${name.toLowerCase()} with older winners to see what changed (topic, opening, length).`,
			ratio: round(cmp.ratio, 2),
			metric: cmp.metric,
			sampleSize: cmp.n,
			comparisonSize: cmp.m,
			confidence: trendConfidence(cmp.n, cmp.m, cmp.ratio),
			evidence: [
				{ label: 'Last 90 days', value: `${compact(cmp.groupAvg)} (${cmp.n} posts)` },
				{ label: 'Before', value: `${compact(cmp.restAvg)} (${cmp.m} posts)` },
			],
		});
	}

	// Overall momentum: last 30 days vs the 90 days before
	{
		const last30 = settled.filter((p) => Date.parse(p.publishedAt as string) >= ctx.now - 30 * DAY_MS);
		const prior = settled.filter((p) => {
			const t = Date.parse(p.publishedAt as string);
			return t < ctx.now - 30 * DAY_MS && t >= ctx.now - 120 * DAY_MS;
		});
		const cmp = compareGroups(last30, prior, 3);
		if (cmp && (cmp.ratio >= 1.2 || cmp.ratio <= 0.8)) {
			const up = cmp.ratio >= 1.2;
			trends.push({
				id: 'momentum',
				category: 'momentum',
				direction: up ? 'up' : 'down',
				headline: up
					? `Engagement is increasing: the typical post from the last 30 days gets ${compact(cmp.groupAvg)} ${cmp.metric} vs ${compact(cmp.restAvg)} in the 90 days before (${describeRatio(cmp.ratio)})`
					: `Engagement is decreasing: the typical post from the last 30 days gets ${compact(cmp.groupAvg)} ${cmp.metric} vs ${compact(cmp.restAvg)} in the 90 days before (−${Math.round((1 - cmp.ratio) * 100)}%)`,
				recommendation: up ? 'Keep the current mix and note which recent posts drove the lift.' : 'Revisit the formats and topics of your top performers and bring them back into the next two weeks of posts.',
				ratio: round(cmp.ratio, 2),
				metric: cmp.metric,
				sampleSize: cmp.n,
				comparisonSize: cmp.m,
				confidence: trendConfidence(cmp.n, cmp.m, cmp.ratio),
				evidence: [
					{ label: 'Last 30 days', value: `${compact(cmp.groupAvg)} (${cmp.n} posts)` },
					{ label: 'Previous 90 days', value: `${compact(cmp.restAvg)} (${cmp.m} posts)` },
				],
			});
		}
	}

	// Caption length and hashtag count
	const bucketTrend = <B extends { id: string; label: string; min: number; max: number }>(
		category: 'caption' | 'hashtags' | 'length',
		buckets: readonly B[],
		measure: (p: ScoredPost) => number,
		population: ScoredPost[] = settled,
	) => {
		const totals = population === settled ? settledTotals : totalsOf(population);
		const groups = buckets
			.map((b) => ({ bucket: b, posts: population.filter((p) => { const v = measure(p); return v >= b.min && v <= b.max; }) }))
			.filter((g) => g.posts.length >= 5);
		if (groups.length < 2) return;
		const compared = groups
			.map((g) => ({ ...g, cmp: compareToRest(g.posts, totals, 5) }))
			.filter((g): g is typeof g & { cmp: NonNullable<typeof g.cmp> } => g.cmp !== null)
			.sort((a, b) => b.cmp.ratio - a.cmp.ratio);
		const top = compared[0];
		if (!top || top.cmp.ratio < 1.2) return;
		trends.push({
			id: `${category}_${top.bucket.id}`,
			category,
			direction: 'up',
			bucketId: top.bucket.id,
			bucketLabel: top.bucket.label,
			headline: `${category === 'length' ? top.bucket.label[0].toUpperCase() + top.bucket.label.slice(1) : `Posts with ${top.bucket.label}`} typically get ${compact(top.cmp.groupAvg)} ${top.cmp.metric} vs ${compact(top.cmp.restAvg)} for the rest (${describeRatio(top.cmp.ratio)})`,
			recommendation: `Use ${top.bucket.label} by default and compare the next posts against this baseline.`,
			ratio: round(top.cmp.ratio, 2),
			metric: top.cmp.metric,
			sampleSize: top.cmp.n,
			comparisonSize: top.cmp.m,
			confidence: trendConfidence(top.cmp.n, top.cmp.m, top.cmp.ratio),
			evidence: compared.map((g) => ({ label: g.bucket.label, value: `${compact(g.cmp.groupAvg)} typical ${g.cmp.metric} · ${g.cmp.n} posts` })),
		});
	};
	bucketTrend('caption', CAPTION_BUCKETS, captionLength);
	bucketTrend('hashtags', HASHTAG_BUCKETS, hashtagCount);
	// Video length, only where the platform reports duration (YouTube); other posts stay out of it.
	if (settled.filter((p) => p.durationSeconds !== null).length >= 10) {
		bucketTrend('length', LENGTH_BUCKETS, (p) => p.durationSeconds ?? -1, settled.filter((p) => p.durationSeconds !== null));
	}

	// Topics: hashtags and caption keywords that recur and outperform
	const topicCandidates = new Map<string, ScoredPost[]>();
	for (const post of settled) {
		for (const key of [...hashtagsOf(post), ...keywordsOf(post)]) {
			const list = topicCandidates.get(key) ?? [];
			list.push(post);
			topicCandidates.set(key, list);
		}
	}
	const topics = [...topicCandidates.entries()]
		.filter(([, posts]) => posts.length >= 3 && posts.length <= settled.length * 0.5)
		.map(([topic, posts]) => ({ topic, posts, cmp: compareToRest(posts, settledTotals, 3) }))
		.filter((t): t is typeof t & { cmp: NonNullable<typeof t.cmp> } => t.cmp !== null && t.cmp.ratio >= 1.3)
		// Hashtags are the creator's own topic labels, so they win ties over caption words.
		.sort((a, b) => topicRank(b) - topicRank(a));
	const reported: Array<Set<string>> = [];
	for (const t of topics) {
		// Skip a topic that mostly covers posts already reported under another one (e.g. "#baking" and "sourdough").
		const ids = t.posts.map((p) => p.id);
		if (reported.some((r) => ids.filter((id) => r.has(id)).length >= ids.length * 0.6)) continue;
		reported.push(new Set(ids));
		const lastPost = t.posts.map((p) => p.publishedAt as string).sort().pop() as string;
		const daysSince = Math.floor((ctx.now - Date.parse(lastPost)) / DAY_MS);
		trends.push({
			id: `topic_${t.topic}`,
			category: 'topic',
			direction: 'up',
			topic: t.topic,
			headline: `Posts about “${t.topic}” typically get ${compact(t.cmp.groupAvg)} ${t.cmp.metric} vs ${compact(t.cmp.restAvg)} for other posts (${describeRatio(t.cmp.ratio)}, ${t.cmp.n} posts)`,
			recommendation: daysSince > 30 ? `You last posted about “${t.topic}” ${daysSince} days ago. Plan 2–3 new posts on it.` : `Keep “${t.topic}” in rotation and try a new angle on it.`,
			ratio: round(t.cmp.ratio, 2),
			metric: t.cmp.metric,
			sampleSize: t.cmp.n,
			comparisonSize: t.cmp.m,
			confidence: trendConfidence(t.cmp.n, t.cmp.m, t.cmp.ratio),
			evidence: [
				{ label: 'Posts on this topic', value: String(t.cmp.n) },
				{ label: `Typical ${t.cmp.metric}`, value: compact(t.cmp.groupAvg) },
				{ label: 'Last posted', value: `${daysSince} days ago` },
			],
		});
		if (reported.length >= 3) break;
	}

	// Timing
	if (recommendation.sufficient && recommendation.confidence !== 'low' && (recommendation.bestTime || recommendation.bestDay)) {
		const slot = (recommendation.bestTime ?? recommendation.bestDay) as TimingSlot;
		const views = slot.lifts.find((l) => l.metric === 'views') ?? slot.lifts.find((l) => l.metric === 'interactions');
		const when = [recommendation.bestDay ? `${recommendation.bestDay.label}s` : null, recommendation.bestTime ? recommendation.bestTime.label : null].filter(Boolean).join(', ');
		trends.push({
			id: 'timing',
			category: 'timing',
			direction: 'up',
			headline: `Your strongest posting window is ${when} (${recommendation.timezone}): average score ${slot.avgScore} vs ${recommendation.accountAvgScore}${views ? `, ${describeRatio(views.ratio)} ${METRIC_NAMES[views.metric]}` : ''}`,
			recommendation: `Schedule your most important posts for ${when}.`,
			ratio: views ? views.ratio : round(slot.avgScore / Math.max(recommendation.accountAvgScore ?? 50, 1), 2),
			metric: views ? views.metric : 'score',
			sampleSize: slot.postCount,
			comparisonSize: recommendation.postsAnalyzed,
			confidence: recommendation.confidence,
			evidence: recommendation.why.map((w, i) => ({ label: i === 0 ? 'Measured' : 'Also', value: w })),
		});
	}

	// Reels watch time vs views
	{
		const reels = settled.filter((p) => p.avgWatchTimeMs !== null && p.metrics.views !== null);
		if (reels.length >= 8) {
			const mid = median(reels.map((p) => p.avgWatchTimeMs as number)) as number;
			const high = reels.filter((p) => (p.avgWatchTimeMs as number) > mid);
			const low = reels.filter((p) => (p.avgWatchTimeMs as number) <= mid);
			const hv = median(high.map((p) => p.metrics.views as number));
			const lv = median(low.map((p) => p.metrics.views as number));
			if (hv !== null && lv !== null && lv > 0 && high.length >= 3 && hv / lv >= 1.3) {
				trends.push({
					id: 'watch_time',
					category: 'watch_time',
					direction: 'up',
					headline: `Reels with average watch time above ${round(mid / 1000, 1)}s get ${describeRatio(hv / lv)} the views of the rest (${compact(hv)} vs ${compact(lv)})`,
					recommendation: 'Hold attention in the first seconds: open with the result or the question, cut the intro, and keep scenes short.',
					ratio: round(hv / lv, 2),
					metric: 'views',
					sampleSize: high.length,
					comparisonSize: low.length,
					confidence: trendConfidence(high.length, low.length, hv / lv),
					evidence: [
						{ label: 'Median of Reels’ average watch time', value: `${round(mid / 1000, 1)}s` },
						{ label: 'Typical views, longer-watched Reels', value: compact(hv) },
						{ label: 'Typical views, other Reels', value: compact(lv) },
					],
				});
			}
		}
	}

	// Posting frequency
	{
		const buckets = computeFrequencyPerformance(ctx).filter((b) => b.weeks >= 4 && b.avgScore !== null);
		if (buckets.length >= 2) {
			const sorted = [...buckets].sort((a, b) => (b.avgScore as number) - (a.avgScore as number));
			const best = sorted[0];
			const worst = sorted[sorted.length - 1];
			if ((best.avgScore as number) - (worst.avgScore as number) >= 8) {
				trends.push({
					id: 'frequency',
					category: 'frequency',
					direction: 'up',
					headline: `In weeks with ${best.label.replace('/week', '')}, posts average a score of ${best.avgScore} vs ${worst.avgScore} in weeks with ${worst.label.replace('/week', '')}`,
					recommendation: `Aim for ${best.label} and keep quality consistent.`,
					ratio: round((best.avgScore as number) / Math.max(worst.avgScore as number, 1), 2),
					metric: 'score',
					sampleSize: best.weeks,
					comparisonSize: worst.weeks,
					confidence: trendConfidence(best.weeks, worst.weeks, (best.avgScore as number) / Math.max(worst.avgScore as number, 1)),
					evidence: buckets.map((b) => ({ label: b.label, value: `score ${b.avgScore} · ${b.weeks} weeks` })),
				});
			}
		}
	}

	return result;
}

// ---- Prioritized tasks ---------------------------------------------------------------------

export interface PriorityTask {
	id: string;
	priority: number;
	title: string;
	impact: 'high' | 'medium' | 'low';
	reason: string;
	supportingData: Evidence[];
	action: string;
	/** The detected trend this task comes from. */
	trendId: string | null;
}

const CONFIDENCE_WEIGHT: Record<Confidence, number> = { high: 1, medium: 0.7, low: 0.4 };

function taskTitle(trend: DetectedTrend, platform: Platform): string {
	const many = () => formatName(trend.format as ContentFormat, platform).many;
	switch (trend.category) {
		case 'format':
			return trend.direction === 'up' ? `Make more ${many()}` : `Fix or reduce ${many()}`;
		case 'format_momentum':
			return trend.direction === 'up' ? `Lean into rising ${many()}` : `Diagnose declining ${many()}`;
		case 'momentum':
			return trend.direction === 'up' ? 'Keep the recent momentum' : 'Reverse the recent decline';
		case 'caption':
			return 'Adjust caption length';
		case 'hashtags':
			return 'Adjust hashtag use';
		case 'length':
			return 'Adjust video length';
		case 'topic':
			return `Repeat “${trend.topic}” content`;
		case 'timing':
			return 'Shift posting time';
		case 'watch_time':
			return 'Improve Reel hooks and retention';
		case 'frequency':
			return 'Adjust posting frequency';
	}
}

export function buildPriorityTasks(trends: DetectedTrends, improve: ScoredPost[], recommendation: PostingRecommendation, ctx: AnalyticsContext): PriorityTask[] {
	const candidates = trends.trends
		.filter((t) => !(t.category === 'momentum' && t.direction === 'up'))
		.map((trend) => {
			const strength = Math.abs(trend.ratio - 1);
			const value = strength * CONFIDENCE_WEIGHT[trend.confidence] * Math.log2(2 + trend.sampleSize);
			// High impact needs a large, well-supported difference; most measured patterns are medium.
			const impact: PriorityTask['impact'] = strength >= 1 && trend.confidence === 'high' ? 'high' : strength >= 0.35 && trend.confidence !== 'low' ? 'medium' : 'low';
			return { trend, value, impact };
		});

	// Timing: also a task when most recent posts miss the strongest window.
	const timing = candidates.find((c) => c.trend.category === 'timing');
	if (timing && recommendation.bestTime) {
		const recent = ctx.posts.filter((p) => p.publishedAt !== null && Date.parse(p.publishedAt) >= ctx.now - 60 * DAY_MS);
		const inWindow = recent.filter((p) => {
			const local = localDayHour(p.publishedAt as string, ctx.timeZone);
			return local && local.hour >= (recommendation.bestTime as { startHour: number }).startHour && local.hour < (recommendation.bestTime as { endHour: number }).endHour;
		});
		if (recent.length >= 4) {
			const share = inWindow.length / recent.length;
			timing.trend.evidence = [...timing.trend.evidence, { label: 'Recent posts in this window', value: `${inWindow.length} of ${recent.length} (last 60 days)` }];
			if (share >= 0.6) timing.value *= 0.3; // already posting there
		}
	}

	const tasks: PriorityTask[] = candidates
		.sort((a, b) => b.value - a.value)
		.slice(0, 5)
		.map(({ trend, impact }, index) => ({
			id: `task_${trend.id}`,
			priority: index + 1,
			title: taskTitle(trend, ctx.platform),
			impact,
			reason: `${trend.headline}.`,
			supportingData: trend.evidence,
			action: trend.recommendation,
			trendId: trend.id,
		}));

	// When there are underperformers but no trend explains them, point at the posts themselves.
	if (tasks.length < 3 && improve.length >= 3) {
		const worst = improve.slice(0, 5);
		tasks.push({
			id: 'task_review_underperformers',
			priority: tasks.length + 1,
			title: 'Review your lowest-scoring posts',
			impact: 'medium',
			reason: `${worst.length} recent or older posts score ${worst.map((p) => p.score).join(', ')} out of 100 against an account median of 50.`,
			supportingData: worst.map((p) => ({ label: `${formatName(p.format, ctx.platform).one} · ${p.publishedAt?.slice(0, 10) ?? 'undated'}`, value: `score ${p.score}` })),
			action: 'Open each one in Needs Improvement and apply its suggestions to your next similar post.',
			trendId: null,
		});
	}
	return tasks;
}

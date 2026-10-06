import type { ConnectedAccountRow } from '../db/accounts';
import type { ContentFormat, Platform } from '../models';
import { DetectedTrend, explainPost, formatName, needsImprovement, ObservedReason, ScoredPost, topPerformers } from './analytics';
import { IntelligenceSnapshot, loadIntelligenceSnapshot, snapshotInsights } from './intelligenceSnapshot';
import { platformName } from './platforms';

// The Analysis screen for a date range: one connected account, or every connected account together
// ("All platforms"). Built only from the per-account snapshots (services/analytics.ts); nothing is
// estimated. Counts (views, likes, comments, posts) are summed across platforms only over posts that
// have the value; engagement rate is never summed. Periods cover posts PUBLISHED in the window, and the
// comparison is with posts published in the window before it.

const DAY_MS = 86_400_000;
export const PERIODS = { '7d': 7, '30d': 30, '90d': 90 } as const;
export type PeriodKey = keyof typeof PERIODS;

export type PerformanceMetric = 'views' | 'likes' | 'comments' | 'posts';
export type TrendMetric = 'views' | 'likes' | 'comments' | 'engagementRate';

const MIN_POSTS_FOR_TOP = 3;

interface Window {
	start: number;
	end: number;
}

function inWindow(post: ScoredPost, w: Window): boolean {
	if (!post.publishedAt) return false;
	const t = Date.parse(post.publishedAt);
	return t >= w.start && t < w.end;
}

function sum(values: Array<number | null>): { total: number | null; count: number } {
	const present = values.filter((v): v is number => v !== null);
	return { total: present.length ? present.reduce((a, b) => a + b, 0) : null, count: present.length };
}

function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const s = [...values].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function change(current: number | null, previous: number | null): number | null {
	if (current === null || previous === null || previous <= 0) return null;
	return Math.round(((current - previous) / previous) * 1000) / 10;
}

const PICK: Record<Exclude<PerformanceMetric, 'posts'> | 'engagementRate', (p: ScoredPost) => number | null> = {
	views: (p) => p.metrics.views,
	likes: (p) => p.metrics.likes,
	comments: (p) => p.metrics.comments,
	engagementRate: (p) => p.engagementRate,
};

export interface AnalysisAccount {
	id: string;
	platform: Platform;
	handle: string;
	displayName: string | null;
	status: ConnectedAccountRow['status'];
	lastSyncedAt: string | null;
	/** Synced items for this account (all time). */
	contentCount: number;
}

export interface PerformanceTile {
	metric: PerformanceMetric;
	/** Sum over posts published in the period; null = no post in scope has this metric. */
	value: number | null;
	previous: number | null;
	/** null = no comparable previous period ("Comparison unavailable"). */
	changePercent: number | null;
	/** Platforms in scope that do not report this metric. */
	unavailableOn: Platform[];
}

export interface TrendSeries {
	accountId: string;
	platform: Platform;
	label: string;
	/** One value per bucket; null = no post (or no value) in that bucket. */
	values: Record<TrendMetric, Array<number | null>>;
}

export interface DistributionItem {
	key: string;
	label: string;
	platform: Platform | null;
	format: ContentFormat | null;
	count: number;
	percent: number;
}

export interface TopPerformer {
	kind: 'platform' | 'format';
	platform: Platform;
	format: ContentFormat | null;
	label: string;
	reason: string;
	metric: 'engagementRate' | 'views';
	value: number;
	changePercent: number | null;
	comparedWith: number;
}

export interface ScopedTrend {
	accountId: string;
	platform: Platform;
	trend: DetectedTrend;
}

export interface ContentIdea {
	id: string;
	accountId: string;
	platform: Platform;
	format: ContentFormat | null;
	/** What to create. */
	idea: string;
	/** Why: the measured pattern(s) it is built on. */
	why: string;
	/** Optional timing from the measured posting window. */
	when: string | null;
	trendIds: string[];
}

export interface AnalysisResult {
	scope: 'all' | string;
	accounts: AnalysisAccount[];
	period: { key: PeriodKey; days: number; start: string; end: string; previousStart: string };
	performance: { tiles: PerformanceTile[]; postsInPeriod: number; headline: { metric: PerformanceMetric; changePercent: number | null } | null };
	/** rollingDays > 1: each daily point covers posts published in the trailing N days. */
	trend: { granularity: 'day' | 'week'; rollingDays: number; buckets: string[]; metrics: TrendMetric[]; series: TrendSeries[]; sufficient: boolean };
	distribution: { kind: 'platform' | 'format'; total: number; items: DistributionItem[] };
	top: TopPerformer | null;
	topNote: string | null;
	topics: ScopedTrend[];
	ideas: ContentIdea[];
	unavailable: Array<{ platform: Platform; topic: string; reason: string }>;
}

function accountSummary(snapshot: IntelligenceSnapshot): AnalysisAccount {
	const a = snapshot.account;
	return {
		id: a.id,
		platform: a.platform,
		handle: a.account_username,
		displayName: a.account_name,
		status: a.status,
		lastSyncedAt: a.last_synced_at ? new Date(a.last_synced_at).toISOString() : null,
		contentCount: snapshot.rows.length,
	};
}

/** Calendar day (YYYY-MM-DD) of an instant in the viewer's time zone. */
function dayKey(ms: number, formatter: Intl.DateTimeFormat): string {
	return formatter.format(new Date(ms));
}

function buildTrend(snapshots: IntelligenceSnapshot[], current: Window, days: number, timeZone: string): AnalysisResult['trend'] {
	const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
	const granularity: 'day' | 'week' = days > 31 ? 'week' : 'day';
	const step = granularity === 'day' ? DAY_MS : 7 * DAY_MS;
	const bucketCount = Math.ceil((current.end - current.start) / step);
	const buckets = Array.from({ length: bucketCount }, (_, i) => dayKey(current.start + i * step, formatter));
	const available = new Set<TrendMetric>();

	// Accounts rarely publish every day, so daily points in a 30-day range are a rolling 7-day window
	// (posts published in the 7 days up to that day); 7-day ranges show each day, 90-day ranges each week.
	const rolling = granularity === 'day' && days > 7 ? 7 : 1;

	const series: TrendSeries[] = [];
	for (const snapshot of snapshots) {
		const posts = snapshot.analytics.posts.filter((p) => inWindow(p, { start: current.start - (rolling - 1) * DAY_MS, end: current.end }));
		if (!posts.some((p) => inWindow(p, current))) continue;
		const values = {} as TrendSeries['values'];
		for (const metric of ['views', 'likes', 'comments', 'engagementRate'] as const) {
			values[metric] = buckets.map((_, i) => {
				const bucketEnd = current.start + (i + 1) * step;
				const bucketStart = bucketEnd - rolling * step;
				const group = posts.filter((p) => {
					const t = Date.parse(p.publishedAt as string);
					return t >= Math.max(bucketStart, current.start - (rolling - 1) * DAY_MS) && t < bucketEnd;
				});
				const present = group.map(PICK[metric]).filter((v): v is number => v !== null);
				if (present.length === 0) return null;
				// Counts add up; engagement rate is the typical (median) post.
				return metric === 'engagementRate' ? Math.round((median(present) as number) * 100) / 100 : present.reduce((a, b) => a + b, 0);
			});
			if (values[metric].some((v) => v !== null)) available.add(metric);
		}
		series.push({ accountId: snapshot.account.id, platform: snapshot.account.platform, label: platformName(snapshot.account.platform), values });
	}
	// A line needs at least two buckets with data to show a trend.
	const sufficient = series.some((s) => Object.values(s.values).some((v) => v.filter((x) => x !== null).length >= 2));
	return { granularity, rollingDays: rolling, buckets, metrics: (['views', 'likes', 'comments', 'engagementRate'] as const).filter((m) => available.has(m)), series, sufficient };
}

function topPlatform(snapshots: IntelligenceSnapshot[], current: Window, previous: Window): { top: TopPerformer | null; note: string | null } {
	const candidates = snapshots
		.map((s) => {
			const now = s.analytics.posts.filter((p) => inWindow(p, current)).map((p) => p.engagementRate).filter((v): v is number => v !== null);
			const before = s.analytics.posts.filter((p) => inWindow(p, previous)).map((p) => p.engagementRate).filter((v): v is number => v !== null);
			return { s, value: now.length >= MIN_POSTS_FOR_TOP ? median(now) : null, previous: before.length >= MIN_POSTS_FOR_TOP ? median(before) : null };
		})
		.filter((c): c is typeof c & { value: number } => c.value !== null)
		.sort((a, b) => b.value - a.value);
	if (candidates.length < 2) return { top: null, note: 'Not enough data to determine a top platform: at least two platforms need 3 or more posts with engagement data in this period.' };
	const best = candidates[0];
	return {
		top: {
			kind: 'platform',
			platform: best.s.account.platform,
			format: null,
			label: platformName(best.s.account.platform),
			reason: 'Highest engagement rate',
			metric: 'engagementRate',
			value: Math.round(best.value * 100) / 100,
			changePercent: change(best.value, best.previous),
			comparedWith: candidates.length,
		},
		note: 'Typical (median) engagement rate per post: interactions ÷ followers on each platform.',
	};
}

function topFormat(snapshot: IntelligenceSnapshot, current: Window, previous: Window): { top: TopPerformer | null; note: string | null } {
	const platform = snapshot.account.platform;
	const posts = snapshot.analytics.posts.filter((p) => inWindow(p, current));
	const before = snapshot.analytics.posts.filter((p) => inWindow(p, previous));
	const useViews = posts.filter((p) => p.metrics.views !== null).length >= MIN_POSTS_FOR_TOP;
	const pick = useViews ? PICK.views : PICK.engagementRate;
	const formats = [...new Set(posts.map((p) => p.format))]
		.map((format) => {
			const values = posts.filter((p) => p.format === format).map(pick).filter((v): v is number => v !== null);
			const prev = before.filter((p) => p.format === format).map(pick).filter((v): v is number => v !== null);
			return { format, value: values.length >= MIN_POSTS_FOR_TOP ? median(values) : null, previous: prev.length >= MIN_POSTS_FOR_TOP ? median(prev) : null };
		})
		.filter((f): f is typeof f & { value: number } => f.value !== null)
		.sort((a, b) => b.value - a.value);
	if (formats.length < 2) return { top: null, note: 'Not enough data to determine a top format: at least two formats need 3 or more posts in this period.' };
	const best = formats[0];
	return {
		top: {
			kind: 'format',
			platform,
			format: best.format,
			label: formatName(best.format, platform).many,
			reason: useViews ? 'Highest typical views per post' : 'Highest typical engagement rate',
			metric: useViews ? 'views' : 'engagementRate',
			value: Math.round(best.value * 100) / 100,
			changePercent: change(best.value, best.previous),
			comparedWith: formats.length,
		},
		note: null,
	};
}

/** Concrete next posts built from the account's measured patterns (rule-based, never invented). */
function contentIdeas(snapshot: IntelligenceSnapshot): ContentIdea[] {
	const { trends, recommendation } = snapshotInsights(snapshot);
	const platform = snapshot.account.platform;
	const up = trends.trends.filter((t) => t.direction === 'up');
	const bestFormat = up.find((t) => t.category === 'format' && t.format);
	const topics = up.filter((t) => t.category === 'topic' && t.topic);
	const when =
		recommendation.sufficient && recommendation.confidence !== 'low' && (recommendation.bestDay || recommendation.bestTime)
			? [recommendation.bestDay ? recommendation.bestDay.label : null, recommendation.bestTime ? recommendation.bestTime.label : null].filter(Boolean).join(', ')
			: null;
	const ideas: ContentIdea[] = [];
	const base = { accountId: snapshot.account.id, platform };
	const formatWord = (f: ContentFormat | null | undefined) => (f ? formatName(f, platform).one : 'post');

	for (const topic of topics.slice(0, 2)) {
		ideas.push({
			...base,
			id: `idea_${snapshot.account.id}_${topic.id}`,
			format: bestFormat?.format ?? null,
			idea: `Create a ${formatWord(bestFormat?.format)} about “${topic.topic}”`,
			why: [topic.headline, bestFormat?.headline].filter(Boolean).join('. ') + '.',
			when,
			trendIds: [topic.id, ...(bestFormat ? [bestFormat.id] : [])],
		});
	}
	if (bestFormat && topics.length === 0) {
		ideas.push({ ...base, id: `idea_${snapshot.account.id}_${bestFormat.id}`, format: bestFormat.format ?? null, idea: `Make your next post a ${formatWord(bestFormat.format)} on a subject that already works for you`, why: `${bestFormat.headline}.`, when, trendIds: [bestFormat.id] });
	}
	for (const t of up) {
		if (ideas.length >= 5) break;
		const make = (idea: string, format: ContentFormat | null = null) =>
			ideas.push({ ...base, id: `idea_${snapshot.account.id}_${t.id}`, format, idea, why: `${t.headline}.`, when, trendIds: [t.id] });
		if (t.category === 'watch_time') make('Open your next Reel with the result or the question in the first seconds', 'REEL');
		else if (t.category === 'length' && t.bucketLabel) make(`Make your next upload one of your ${t.bucketLabel}`, 'VIDEO');
		else if (t.category === 'caption' && t.bucketLabel) make(`Write ${t.bucketLabel} for your next posts`);
		else if (t.category === 'hashtags' && t.bucketLabel) make(`Use ${t.bucketLabel} on your next posts`);
		else if (t.category === 'format_momentum' && t.format) make(`Publish another ${formatWord(t.format)} while they are rising`, t.format);
	}
	return ideas.slice(0, 5);
}

export function parsePeriod(raw: string | null): PeriodKey | null {
	if (raw === null) return '30d';
	return raw in PERIODS ? (raw as PeriodKey) : null;
}

export async function buildAnalysis(
	accounts: ConnectedAccountRow[],
	scope: 'all' | string,
	periodKey: PeriodKey,
	timeZone: string,
	now: number,
): Promise<AnalysisResult> {
	const snapshots = await Promise.all(accounts.map((a) => loadIntelligenceSnapshot(a, timeZone, now)));
	const inScope = scope === 'all' ? snapshots : snapshots.filter((s) => s.account.id === scope);
	const days = PERIODS[periodKey];
	const current: Window = { start: now - days * DAY_MS, end: now };
	const previous: Window = { start: now - 2 * days * DAY_MS, end: current.start };

	// Performance tiles: sums of posts published in each window.
	const postsNow = inScope.flatMap((s) => s.analytics.posts.filter((p) => inWindow(p, current)));
	const postsBefore = inScope.flatMap((s) => s.analytics.posts.filter((p) => inWindow(p, previous)));
	const tiles: PerformanceTile[] = (['views', 'likes', 'comments', 'posts'] as const).map((metric) => {
		if (metric === 'posts') {
			return { metric, value: postsNow.length, previous: postsBefore.length, changePercent: change(postsNow.length, postsBefore.length), unavailableOn: [] };
		}
		const nowSum = sum(postsNow.map(PICK[metric]));
		const beforeSum = sum(postsBefore.map(PICK[metric]));
		const unavailableOn = inScope.filter((s) => s.analytics.posts.length > 0 && s.analytics.posts.every((p) => PICK[metric](p) === null)).map((s) => s.account.platform);
		return { metric, value: nowSum.total, previous: beforeSum.total, changePercent: change(nowSum.total, beforeSum.total), unavailableOn };
	});
	const headlineTile = tiles.find((t) => t.metric === 'views' && t.value !== null) ?? tiles.find((t) => t.metric === 'likes' && t.value !== null) ?? null;

	// Distribution: by platform (all) or by format (one account), over posts published in the period.
	let distribution: AnalysisResult['distribution'];
	if (scope === 'all') {
		const items = inScope
			.map((s) => ({ key: s.account.id, label: platformName(s.account.platform), platform: s.account.platform, format: null, count: s.analytics.posts.filter((p) => inWindow(p, current)).length }))
			.filter((i) => i.count > 0);
		const total = items.reduce((a, b) => a + b.count, 0);
		distribution = { kind: 'platform', total, items: items.map((i) => ({ ...i, percent: total ? Math.round((i.count / total) * 100) : 0 })) };
	} else {
		const platform = inScope[0]?.account.platform ?? 'instagram';
		const counts = new Map<ContentFormat, number>();
		for (const p of postsNow) counts.set(p.format, (counts.get(p.format) ?? 0) + 1);
		const total = postsNow.length;
		distribution = {
			kind: 'format',
			total,
			items: [...counts.entries()]
				.sort((a, b) => b[1] - a[1])
				.map(([format, count]) => ({ key: format, label: formatName(format, platform).many, platform, format, count, percent: total ? Math.round((count / total) * 100) : 0 })),
		};
	}

	const topResult = scope === 'all' ? topPlatform(inScope, current, previous) : inScope[0] ? topFormat(inScope[0], current, previous) : { top: null, note: null };

	// Topics and ideas are measured over each account's full synced history (patterns need it).
	const topics: ScopedTrend[] = inScope
		.flatMap((s) => snapshotInsights(s).trends.trends.map((trend) => ({ accountId: s.account.id, platform: s.account.platform, trend })))
		.sort((a, b) => Number(b.trend.category === 'topic') - Number(a.trend.category === 'topic') || Math.abs(b.trend.ratio - 1) - Math.abs(a.trend.ratio - 1));
	const ideasByAccount = inScope.map(contentIdeas);
	// Interleave accounts so one platform does not fill the list.
	const ideas: ContentIdea[] = [];
	for (let i = 0; i < 5; i++) for (const list of ideasByAccount) if (list[i]) ideas.push(list[i]);

	return {
		scope,
		accounts: snapshots.map(accountSummary),
		period: { key: periodKey, days, start: new Date(current.start).toISOString(), end: new Date(current.end).toISOString(), previousStart: new Date(previous.start).toISOString() },
		performance: { tiles, postsInPeriod: postsNow.length, headline: headlineTile ? { metric: headlineTile.metric, changePercent: headlineTile.changePercent } : null },
		trend: buildTrend(inScope, current, days, timeZone),
		distribution,
		top: topResult.top,
		topNote: topResult.note,
		topics: topics.slice(0, 12),
		ideas: ideas.slice(0, 8),
		unavailable: inScope.flatMap((s) => snapshotInsights(s).trends.unavailable.map((u) => ({ platform: s.account.platform, ...u }))),
	};
}

export interface AnalysisContentItem {
	post: ScoredPost;
	accountId: string;
	platform: Platform;
	isVideo: boolean;
	/** The strongest measured reason (why it is top / why it needs improvement). */
	reasons: ObservedReason[];
}

/**
 * Top content or content that needs improvement, published in the period, across the scope. Scores are
 * percentiles within each account, so posts from different platforms are ranked by how well each did
 * relative to its own account.
 */
export async function buildAnalysisContent(
	accounts: ConnectedAccountRow[],
	type: 'top' | 'improve',
	periodKey: PeriodKey,
	timeZone: string,
	now: number,
	limit: number,
	offset: number,
): Promise<{ items: AnalysisContentItem[]; total: number; nextOffset: number | null }> {
	const snapshots = await Promise.all(accounts.map((a) => loadIntelligenceSnapshot(a, timeZone, now)));
	const window: Window = { start: now - PERIODS[periodKey] * DAY_MS, end: now };
	const ranked = snapshots
		.flatMap((s) => (type === 'top' ? topPerformers(s.analytics) : needsImprovement(s.analytics)).filter((p) => inWindow(p, window)).map((post) => ({ s, post })))
		.sort((a, b) => (type === 'top' ? (b.post.score as number) - (a.post.score as number) : (a.post.score as number) - (b.post.score as number)));
	const page = ranked.slice(offset, offset + limit).map(({ s, post }) => {
		const { recommendation, trends } = snapshotInsights(s);
		const row = s.rows.find((r) => r.id === post.id);
		return {
			post,
			accountId: s.account.id,
			platform: s.account.platform,
			isVideo: post.format === 'REEL' || post.format === 'VIDEO' || row?.media_type === 'VIDEO',
			reasons: explainPost(s.analytics, post, type, recommendation, trends).reasons.slice(0, 2),
		};
	});
	return { items: page, total: ranked.length, nextOffset: offset + page.length < ranked.length ? offset + page.length : null };
}

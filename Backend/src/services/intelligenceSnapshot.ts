import { ConnectedAccountRow, findAccountById, findAccountsByUserId } from '../db/accounts';
import { ContentRow, getAccountInsights, getAllContentByAccountId } from '../db/content';
import { HttpError } from '../lib/http';
import {
	ArchiveSummary,
	Baseline,
	computeArchiveSummary,
	computeBaseline,
	computeFormatPerformance,
	computeTierThresholds,
	computeTiming,
	FormatPerformance,
	IntelligencePost,
	rankPosts,
	TierThresholds,
	TimingAnalysis,
	toIntelligencePost,
} from './intelligence';
import {
	AnalyticsContext,
	buildAnalyticsContext,
	buildPriorityTasks,
	computePostingRecommendation,
	DetectedTrends,
	detectTrends,
	needsImprovement,
	PostingRecommendation,
	PriorityTask,
} from './analytics';

/** Everything the intelligence endpoints and the AI context are computed from, for one account. */
export interface IntelligenceSnapshot {
	account: ConnectedAccountRow;
	rows: ContentRow[];
	posts: IntelligencePost[];
	profile: {
		followers: number | null;
		following: number | null;
		mediaCount: number | null;
		/** Latest account-level values from the platform insights API (period "day"), if any. */
		reach: { value: number; period: string | null; date: string | null } | null;
		impressions: { value: number; period: string | null; date: string | null } | null;
		/** Account views / accounts engaged over the platform period (Instagram: last 28 days, metric_type=total_value). */
		views: { value: number; period: string | null; date: string | null } | null;
		accountsEngaged: { value: number; period: string | null; date: string | null } | null;
	};
	baseline: Baseline;
	archive: ArchiveSummary;
	formats: FormatPerformance[];
	ranking: { sufficient: boolean; working: IntelligencePost[]; attention: IntelligencePost[] };
	timing: TimingAnalysis;
	tiers: TierThresholds;
	/** Every post with its performance score (see services/analytics.ts). */
	analytics: AnalyticsContext;
}

const derived = new WeakMap<IntelligenceSnapshot, { recommendation: PostingRecommendation; trends: DetectedTrends; tasks: PriorityTask[] }>();

/** Posting recommendation, detected trends and prioritized tasks, computed once per snapshot. */
export function snapshotInsights(snapshot: IntelligenceSnapshot) {
	let value = derived.get(snapshot);
	if (!value) {
		const recommendation = computePostingRecommendation(snapshot.analytics);
		const trends = detectTrends(snapshot.analytics, recommendation);
		const tasks = buildPriorityTasks(trends, needsImprovement(snapshot.analytics), recommendation, snapshot.analytics);
		value = { recommendation, trends, tasks };
		derived.set(snapshot, value);
	}
	return value;
}

/**
 * Resolves the requested account (checking ownership), or — when none is requested — the user's first
 * Instagram account, falling back to their first connected account of any platform.
 */
export async function resolveAnalyticsAccount(
	userId: string,
	accountId: string | null,
): Promise<{ account: ConnectedAccountRow | null; accounts: ConnectedAccountRow[] }> {
	const accounts = await findAccountsByUserId(userId);
	if (accountId) {
		const account = await findAccountById(accountId);
		if (!account || account.user_id !== userId) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Connected account not found.');
		return { account, accounts };
	}
	return { account: accounts.find((a) => a.platform === 'instagram') ?? accounts[0] ?? null, accounts };
}

export async function loadIntelligenceSnapshot(account: ConnectedAccountRow, timeZone: string, now: number): Promise<IntelligenceSnapshot> {
	const [rows, insightRows] = await Promise.all([getAllContentByAccountId(account.id), getAccountInsights(account.id)]);

	const profileMetric = (name: string) => insightRows.find((i) => i.metric_name === name && i.provider_source === 'profile')?.metric_value ?? null;
	const latestInsight = (name: string) => {
		const match = insightRows
			.filter((i) => i.metric_name === name && i.provider_source === 'insights_api')
			.sort((a, b) => b.updated_at - a.updated_at)[0];
		return match ? { value: match.metric_value, period: match.period, date: match.metric_date } : null;
	};

	const followers = profileMetric('followers_count');
	const baseline = computeBaseline(rows);
	const posts = rows.map((row) => toIntelligencePost(row, followers, baseline.avgInteractions));
	const mediaCount = profileMetric('media_count');

	return {
		account,
		rows,
		posts,
		profile: {
			followers,
			following: profileMetric('follows_count'),
			mediaCount,
			reach: latestInsight('reach'),
			impressions: latestInsight('impressions'),
			views: latestInsight('views'),
			accountsEngaged: latestInsight('accounts_engaged'),
		},
		baseline,
		archive: computeArchiveSummary(posts, mediaCount),
		formats: computeFormatPerformance(posts),
		ranking: rankPosts(posts, baseline.avgInteractions, now),
		timing: computeTiming(posts, timeZone),
		tiers: computeTierThresholds(baseline, posts, now),
		analytics: buildAnalyticsContext(posts, rows, timeZone, now, account.platform),
	};
}

/** Changes whenever a sync completes, so cached AI output is invalidated by new data. */
export function snapshotVersion(account: ConnectedAccountRow): string {
	return String(account.last_synced_at ?? 0);
}

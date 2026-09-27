import { ConnectedAccountRow, findAccountById, findAccountsByUserId } from '../db/accounts';
import { getAllInstagramMediaByAccountId, getInstagramInsightsByAccountId, InstagramMediaRow } from '../db/instagramData';
import { HttpError } from '../lib/http';
import {
	ArchiveSummary,
	Baseline,
	computeArchiveSummary,
	computeBaseline,
	computeFormatPerformance,
	computeTiming,
	FormatPerformance,
	IntelligencePost,
	rankPosts,
	TimingAnalysis,
	toIntelligencePost,
} from './intelligence';

/** Everything the intelligence endpoints and the AI context are computed from, for one account. */
export interface IntelligenceSnapshot {
	account: ConnectedAccountRow;
	rows: InstagramMediaRow[];
	posts: IntelligencePost[];
	profile: {
		followers: number | null;
		following: number | null;
		mediaCount: number | null;
		/** Latest account-level values from the Instagram insights API (period "day"), if any. */
		reach: { value: number; period: string | null; date: string | null } | null;
		impressions: { value: number; period: string | null; date: string | null } | null;
	};
	baseline: Baseline;
	archive: ArchiveSummary;
	formats: FormatPerformance[];
	ranking: { sufficient: boolean; working: IntelligencePost[]; attention: IntelligencePost[] };
	timing: TimingAnalysis;
}

/** Resolves the requested account (or the user's first Instagram account) and checks ownership. */
export async function resolveInstagramAccount(
	db: D1Database,
	userId: string,
	accountId: string | null,
): Promise<{ account: ConnectedAccountRow | null; accounts: ConnectedAccountRow[] }> {
	const accounts = await findAccountsByUserId(db, userId);
	if (accountId) {
		const account = await findAccountById(db, accountId);
		if (!account || account.user_id !== userId) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Connected account not found.');
		if (account.platform !== 'instagram') {
			throw new HttpError(400, 'INVALID_PLATFORM', 'Intelligence is currently available for Instagram accounts only.');
		}
		return { account, accounts };
	}
	return { account: accounts.find((a) => a.platform === 'instagram') ?? null, accounts };
}

export async function loadIntelligenceSnapshot(
	env: Env,
	account: ConnectedAccountRow,
	timeZone: string,
	now: number,
): Promise<IntelligenceSnapshot> {
	const [rows, insightRows] = await Promise.all([
		getAllInstagramMediaByAccountId(env.DB, account.id),
		getInstagramInsightsByAccountId(env.DB, account.id),
	]);

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
		},
		baseline,
		archive: computeArchiveSummary(posts, mediaCount),
		formats: computeFormatPerformance(posts),
		ranking: rankPosts(posts, baseline.avgInteractions, now),
		timing: computeTiming(posts, timeZone),
	};
}

/** Changes whenever a sync completes, so cached AI output is invalidated by new data. */
export function snapshotVersion(account: ConnectedAccountRow): string {
	return String(account.last_synced_at ?? 0);
}

import { findAccountsByUserId } from '../db/accounts';
import { HttpError, ok } from '../lib/http';
import { withAuth } from '../middleware/auth';
import { resolveTimeZone } from '../services/intelligence';
import { loadIntelligenceSnapshot, resolveInstagramAccount } from '../services/intelligenceSnapshot';
import { fetchInstagramDashboard } from '../services/instagramSync';

function notAvailable(message: string): HttpError {
	return new HttpError(501, 'FEATURE_NOT_AVAILABLE', message);
}

function notAvailableRoute(message: string) {
	return withAuth(() => {
		throw notAvailable(message);
	});
}

/** Overview route returns real data if accounts are connected, or 501 if no accounts connected yet. */
export const overview = withAuth(async (context, auth) => {
	const rows = await findAccountsByUserId(context.env.DB, auth.user.id);
	if (rows.length === 0) {
		throw notAvailable('Performance overview isn’t available yet. Connect a social account to unlock.');
	}

	const connectedAccounts = rows.map((row) => ({
		id: row.id,
		platform: row.platform as 'instagram' | 'youtube' | 'linkedin' | 'facebook',
		handle: row.account_username,
		displayName: row.account_name,
		status: row.status,
		connectedAt: new Date(row.created_at).toISOString(),
		lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
	}));

	const channels: Array<{
		accountId: string;
		platform: 'instagram';
		handle: string;
		followers: number | null;
		followersChangePercent: number | null;
		engagementRate: number | null;
	}> = [];

	const insights: Array<{
		id: string;
		label: string;
		value: number;
		unit: 'count' | 'percent';
		changePercent: number | null;
		period: string;
	}> = [];

	const instagramAcc = rows.find((r) => r.platform === 'instagram');
	if (instagramAcc) {
		try {
			const dash = await fetchInstagramDashboard(context.env, auth.user.id, instagramAcc.id);
			channels.push({
				accountId: instagramAcc.id,
				platform: 'instagram',
				handle: instagramAcc.account_username,
				followers: dash.metrics.followersCount,
				followersChangePercent: null,
				engagementRate: dash.metrics.engagementRate,
			});

			if (dash.metrics.followersCount !== null) {
				insights.push({
					id: 'ins_followers',
					label: 'Instagram Followers',
					value: dash.metrics.followersCount,
					unit: 'count',
					changePercent: null,
					period: 'Total Followers',
				});
			}
			if (dash.metrics.mediaCount !== null) {
				insights.push({
					id: 'ins_posts',
					label: 'Instagram Posts',
					value: dash.metrics.mediaCount,
					unit: 'count',
					changePercent: null,
					period: 'Total Synced Media',
				});
			}
			if (dash.metrics.engagementRate !== null) {
				insights.push({
					id: 'ins_engagement',
					label: 'Avg Engagement Rate',
					value: dash.metrics.engagementRate,
					unit: 'percent',
					changePercent: null,
					period: 'Latest 50 posts',
				});
			}
		} catch {
			// Fallback channel item if dashboard metrics query encounters partial issue
			channels.push({
				accountId: instagramAcc.id,
				platform: 'instagram',
				handle: instagramAcc.account_username,
				followers: null,
				followersChangePercent: null,
				engagementRate: null,
			});
		}
	}

	return ok({
		accounts: connectedAccounts,
		heroSignal: null,
		channels,
		insights,
	});
});

/**
 * GET /api/planner/insights?tz= — posting-time patterns from real Instagram history.
 * Returns empty heatmap/windows (the app's "not enough history" state) until there are enough
 * posts; windows are only measured averages, never invented recommendations.
 */
export const plannerInsights = withAuth(async (context, auth) => {
	const { account } = await resolveInstagramAccount(context.env.DB, auth.user.id, null);
	if (!account) throw notAvailable('Connect Instagram to unlock personalized planning.');

	const timeZone = resolveTimeZone(context.url.searchParams.get('tz'));
	const { timing, baseline } = await loadIntelligenceSnapshot(context.env, account, timeZone, context.now);
	return ok({
		timezone: timing.timezone,
		sufficient: timing.sufficient,
		postsAnalyzed: timing.postsAnalyzed,
		minimumRequired: timing.minimumRequired,
		heatmap: timing.heatmap,
		recommendedWindows: timing.windows.map((cell) => ({
			id: `window_${cell.dayOfWeek}_${cell.startHour}`,
			dayOfWeek: cell.dayOfWeek,
			startHour: cell.startHour,
			endHour: cell.endHour,
			score: cell.score,
			platform: 'instagram' as const,
			rationale: `Averaged ${cell.avgInteractions} interactions across ${cell.postCount} posts${
				baseline.avgInteractions !== null ? ` (account average ${baseline.avgInteractions})` : ''
			}.`,
		})),
	});
});

/** Future: { notifications: AppNotification[] } */
export const listNotifications = notAvailableRoute('Notifications aren’t available yet.');

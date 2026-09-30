import { Router } from 'express';

import { getPreferences } from '../db/users';
import { HttpError, ok, queryParam } from '../lib/http';
import { authOf, requireAuth } from '../middleware/auth';
import { resolveTimeZone } from '../services/intelligence';
import { loadIntelligenceSnapshot, resolveAnalyticsAccount } from '../services/intelligenceSnapshot';
import { platformName } from '../services/platforms';
import { accountSummary } from './intelligence';

export function plannerRouter(): Router {
	const router = Router();
	router.use(requireAuth);

	/**
	 * GET /api/planner/insights?tz=&accountId= — posting-time patterns measured from the account's real
	 * history. Heatmap/windows stay empty (the app's "not enough history" state) until there are enough
	 * posts; windows are only measured averages, never invented recommendations. Publishing/scheduling is
	 * not offered, and the response says so instead of pretending.
	 */
	router.get('/insights', async (req, res) => {
		const userId = authOf(req).user.id;
		const { account, accounts } = await resolveAnalyticsAccount(userId, queryParam(req, 'accountId'));
		if (!account) throw new HttpError(501, 'FEATURE_NOT_AVAILABLE', 'Connect a social account to unlock personalized planning.');

		const timeZone = resolveTimeZone(queryParam(req, 'tz') ?? (await getPreferences(userId)).timeZone);
		const { timing, baseline, tiers } = await loadIntelligenceSnapshot(account, timeZone, req.now);
		const name = platformName(account.platform);
		ok(res, {
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
				platform: account.platform,
				rationale: `Averaged ${cell.avgInteractions} interactions across ${cell.postCount} posts${
					baseline.avgInteractions !== null ? ` (account average ${baseline.avgInteractions})` : ''
				}.`,
			})),
			/** Measured comparison points for the windows above. */
			baseline: { avgInteractions: baseline.avgInteractions, typicalInteractions: tiers.typicalInteractions },
			account: accountSummary(account),
			accounts: accounts.map(accountSummary),
			scheduling: {
				supported: false,
				reason: `Scheduling posts to ${name} isn’t available in Media Navigator yet. Timing insights are measured from your published ${name} history.`,
			},
		});
	});

	return router;
}

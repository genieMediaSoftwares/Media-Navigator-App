import { Router } from 'express';

import { findAccountsByUserId } from '../db/accounts';
import { HttpError, ok } from '../lib/http';
import { authOf, requireAuth } from '../middleware/auth';
import { fetchAccountDashboard } from '../services/instagramSync';
import { platformName } from '../services/platforms';
import { Platform } from '../models';

interface Channel {
	accountId: string;
	platform: Platform;
	handle: string;
	followers: number | null;
	followersChangePercent: number | null;
	engagementRate: number | null;
}

interface QuickInsight {
	id: string;
	label: string;
	value: number;
	unit: 'count' | 'percent';
	changePercent: number | null;
	period: string;
	platform: Platform;
	accountId: string;
}

const FOLLOWER_LABEL: Record<Platform, string> = { instagram: 'Followers', facebook: 'Followers', youtube: 'Subscribers', linkedin: 'Followers' };
const CONTENT_LABEL: Record<Platform, string> = { instagram: 'Posts', facebook: 'Posts', youtube: 'Videos', linkedin: 'Posts' };

export function overviewRouter(): Router {
	const router = Router();
	router.use(requireAuth);

	/**
	 * GET /api/overview — Home. Channels and quick insights for every connected account, computed over
	 * each account's latest 50 synced items. With only Instagram connected the response is unchanged
	 * from the Instagram-only version (same ids, labels and periods).
	 */
	router.get('/', async (req, res) => {
		const userId = authOf(req).user.id;
		const rows = await findAccountsByUserId(userId);
		if (rows.length === 0) {
			throw new HttpError(501, 'FEATURE_NOT_AVAILABLE', 'Performance overview isn’t available yet. Connect a social account to unlock.');
		}

		const accounts = rows.map((row) => ({
			id: row.id,
			platform: row.platform,
			handle: row.account_username,
			displayName: row.account_name,
			status: row.status,
			connectedAt: new Date(row.created_at).toISOString(),
			lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
		}));

		const channels: Channel[] = [];
		const insights: QuickInsight[] = [];
		// The first Instagram account keeps the original insight ids so existing clients render it as before.
		const primaryInstagram = rows.find((r) => r.platform === 'instagram');

		for (const row of rows) {
			const name = platformName(row.platform);
			const idFor = (key: string) => (row === primaryInstagram ? `ins_${key}` : `${row.platform}_${key}_${row.id}`);
			try {
				const dash = await fetchAccountDashboard(userId, row.id);
				channels.push({
					accountId: row.id,
					platform: row.platform,
					handle: row.account_username,
					followers: dash.metrics.followersCount,
					followersChangePercent: null,
					engagementRate: dash.metrics.engagementRate,
				});
				const base = { changePercent: null, platform: row.platform, accountId: row.id };
				if (dash.metrics.followersCount !== null) {
					insights.push({ ...base, id: idFor('followers'), label: `${name} ${FOLLOWER_LABEL[row.platform]}`, value: dash.metrics.followersCount, unit: 'count', period: `Total ${FOLLOWER_LABEL[row.platform]}` });
				}
				if (dash.metrics.mediaCount !== null) {
					insights.push({ ...base, id: idFor('posts'), label: `${name} ${CONTENT_LABEL[row.platform]}`, value: dash.metrics.mediaCount, unit: 'count', period: 'Total Synced Media' });
				}
				if (dash.metrics.engagementRate !== null) {
					insights.push({ ...base, id: idFor('engagement'), label: 'Avg Engagement Rate', value: dash.metrics.engagementRate, unit: 'percent', period: 'Latest 50 posts' });
				}
			} catch {
				channels.push({ accountId: row.id, platform: row.platform, handle: row.account_username, followers: null, followersChangePercent: null, engagementRate: null });
			}
		}

		ok(res, { accounts, heroSignal: null, channels, insights });
	});

	return router;
}

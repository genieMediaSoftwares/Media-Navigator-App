import { getConfig } from '../config/env';
import type { ConnectedAccountRow } from '../db/accounts';
import { getLastSyncRun } from '../db/content';
import { ContentItem } from '../models';

/** Instagram's media edge returns at most the 10,000 most recently created media. */
export const INSTAGRAM_MEDIA_API_LIMIT = 10_000;

export type SyncState = 'never' | 'syncing' | 'completed' | 'partial' | 'failed';

export interface SyncStatusSummary {
	state: SyncState;
	lastSyncedAt: string | null;
	/** Last run that walked every page; older posts' metrics are refreshed on these runs. */
	lastFullSyncAt: string | null;
	/** Posts stored in Media Navigator for this account. */
	storedCount: number;
	/** Content count the platform's profile reports; null when it did not report one. */
	profileMediaCount: number | null;
	lastRun: {
		status: 'running' | 'completed' | 'partial' | 'failed';
		mode: 'full' | 'incremental';
		startedAt: string;
		completedAt: string | null;
		itemsFetched: number;
		newItems: number;
		pagesFetched: number;
		reachedEnd: boolean;
		errorCode: string | null;
		errorMessage: string | null;
	} | null;
	/** Background sync interval; null when automatic sync is disabled on the server. */
	autoSyncIntervalMs: number | null;
	/** Plain-language notes about counts or limits (never estimates). */
	notes: string[];
}

export async function describeSyncStatus(account: ConnectedAccountRow, now = Date.now()): Promise<SyncStatusSummary> {
	const config = getConfig();
	const [run, storedCount] = await Promise.all([getLastSyncRun(account.id), ContentItem.countDocuments({ connectedAccountId: account.id })]);
	const runningRecently = run?.status === 'running' && now - run.started_at < config.SYNC_LEASE_MS;
	const state: SyncState = !run ? 'never' : runningRecently ? 'syncing' : run.status === 'running' ? 'failed' : run.status;

	const profileMediaCount = run?.profile_media_count ?? null;
	const notes: string[] = [];
	if (account.platform === 'instagram' && profileMediaCount !== null && profileMediaCount > storedCount) {
		if (profileMediaCount > INSTAGRAM_MEDIA_API_LIMIT && storedCount >= INSTAGRAM_MEDIA_API_LIMIT * 0.99) {
			notes.push(`Instagram reports ${profileMediaCount.toLocaleString()} posts, but its API only returns the ${INSTAGRAM_MEDIA_API_LIMIT.toLocaleString()} most recent.`);
		} else {
			notes.push(
				`Instagram reports ${profileMediaCount.toLocaleString()} posts and ${storedCount.toLocaleString()} are synced. Stories and some media types (for example, posts Instagram does not expose to its API) are not returned by the media API.`,
			);
		}
	}
	if (run?.status === 'partial' && run.error_message) notes.push(run.error_message);

	return {
		state,
		lastSyncedAt: account.last_synced_at ? new Date(account.last_synced_at).toISOString() : null,
		lastFullSyncAt: account.last_full_sync_at ? new Date(account.last_full_sync_at).toISOString() : null,
		storedCount,
		profileMediaCount,
		lastRun: run
			? {
					status: run.status,
					mode: run.mode,
					startedAt: new Date(run.started_at).toISOString(),
					completedAt: run.completed_at ? new Date(run.completed_at).toISOString() : null,
					itemsFetched: run.items_fetched,
					newItems: run.new_items,
					pagesFetched: run.pages_fetched,
					reachedEnd: run.reached_end,
					errorCode: run.error_code,
					errorMessage: run.error_message,
				}
			: null,
		autoSyncIntervalMs: config.AUTO_SYNC_INTERVAL_MS > 0 ? config.AUTO_SYNC_INTERVAL_MS : null,
		notes,
	};
}

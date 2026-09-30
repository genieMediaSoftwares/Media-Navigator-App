import { ConnectedAccountRow, updateAccountStatusAndSynced } from '../../db/accounts';
import { ContentInput, createSyncRun, updateSyncRun, upsertAccountInsight, upsertContentItems } from '../../db/content';
import { HttpError } from '../../lib/http';
import { getPlatformCredentials, PlatformCredentials, updatePlatformCredentials } from '../credentials';
import type { SyncSummary } from '../instagramSync';
import { platformName } from '../platforms';
import { ProviderApiError, ProviderAuthError } from './types';

export interface PulledData {
	profile: {
		accountName?: string | null;
		accountUsername?: string | null;
		profilePictureUrl?: string | null;
		/** Stored as the `followers_count` / `follows_count` / `media_count` profile metrics. */
		followers: number | null;
		following: number | null;
		mediaCount: number | null;
	};
	/** Account-level insight values (period/date as the platform reports them). */
	accountInsights: Array<{ metricName: string; metricValue: number; period: string; metricDate: string }>;
	/** Pages of content, written as they arrive. */
	content: ContentInput[];
}

export interface PullContext {
	account: ConnectedAccountRow;
	credentials: PlatformCredentials;
	now: number;
	fetchImpl: typeof fetch;
}

/**
 * Shared sync lifecycle for Facebook, YouTube and LinkedIn: decrypt the credential, refresh it when it
 * is about to expire, record a sync run, write profile metrics and content, and mark the account for
 * reauthorization when the platform rejects the credential.
 */
export async function runProviderSync(
	account: ConnectedAccountRow,
	now: number,
	fetchImpl: typeof fetch,
	steps: {
		refresh?: (credentials: PlatformCredentials, fetchImpl: typeof fetch) => Promise<PlatformCredentials | null>;
		pull: (context: PullContext) => Promise<PulledData>;
	},
): Promise<SyncSummary> {
	const name = platformName(account.platform);
	let credentials = await getPlatformCredentials(account.user_id, account.token_reference);
	if (!credentials?.accessToken) {
		await updateAccountStatusAndSynced(account.id, 'reauthorization_required', null, now);
		throw new HttpError(400, 'REAUTHORIZATION_REQUIRED', `Access expired or was revoked. Please reconnect your ${name} account.`);
	}

	const syncRunId = await createSyncRun(account.id, now);
	try {
		const expiresSoon = typeof credentials.expiresAt === 'number' && credentials.expiresAt - now < 5 * 60 * 1000;
		if (expiresSoon) {
			const refreshed = steps.refresh ? await steps.refresh(credentials, fetchImpl) : null;
			if (!refreshed) throw new ProviderAuthError(`${name} access has expired.`);
			credentials = refreshed;
			await updatePlatformCredentials(account.user_id, account.token_reference, credentials);
		}

		const data = await steps.pull({ account, credentials, now, fetchImpl });
		let metricsSynced = 0;
		for (const [metricName, value] of [
			['followers_count', data.profile.followers],
			['follows_count', data.profile.following],
			['media_count', data.profile.mediaCount],
		] as const) {
			if (value !== null) {
				await upsertAccountInsight(account.id, { metricName, metricValue: value, providerSource: 'profile' }, now);
				metricsSynced++;
			}
		}
		for (const insight of data.accountInsights) {
			await upsertAccountInsight(account.id, { ...insight, providerSource: 'insights_api' }, now);
			metricsSynced++;
		}
		for (let i = 0; i < data.content.length; i += 50) {
			await upsertContentItems(account.user_id, account.id, account.platform, data.content.slice(i, i + 50), now);
		}

		await updateAccountStatusAndSynced(account.id, 'connected', now, now, {
			accountName: data.profile.accountName ?? undefined,
			accountUsername: data.profile.accountUsername ?? undefined,
			profilePictureUrl: data.profile.profilePictureUrl ?? undefined,
		});
		await updateSyncRun(syncRunId, 'completed', data.content.length, now);
		return { accountId: account.id, postsSynced: data.content.length, metricsSynced, lastSyncedAt: new Date(now).toISOString() };
	} catch (error) {
		if (error instanceof ProviderAuthError) {
			await updateAccountStatusAndSynced(account.id, 'reauthorization_required', null, now);
			await updateSyncRun(syncRunId, 'failed', 0, now, { code: 'INVALID_TOKEN', message: error.message });
			throw new HttpError(400, 'INVALID_TOKEN', `${name} rejected the stored access. Please reconnect your ${name} account.`);
		}
		const message = error instanceof ProviderApiError || error instanceof Error ? error.message : `${name} sync failed.`;
		await updateSyncRun(syncRunId, 'failed', 0, now, { code: 'SYNC_ERROR', message });
		if (error instanceof ProviderApiError) throw new HttpError(502, 'PLATFORM_API_ERROR', `${name} returned an error: ${message}`);
		throw new HttpError(500, 'SYNC_FAILED', `${name} sync failed due to a network or server error. Please try again.`);
	}
}

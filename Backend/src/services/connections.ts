import {
	ConnectedAccountRow,
	deleteConnectedAccount,
	findAccountById,
	findAccountByPlatformAndAccountId,
	upsertConnectedAccount,
} from '../db/accounts';
import { deleteAccountData } from '../db/content';
import { HttpError } from '../lib/http';
import { PendingConnection, PendingOption, Platform } from '../models';
import { decryptJson, deletePlatformCredentials, encryptJson, PlatformCredentials, storePlatformCredentials } from './credentials';
import type { SyncSummary } from './instagramSync';
import { computeBaseline, interactionsOf } from './intelligence';
import { clearNotification, notify } from './notifications';
import { appRedirect, consumeOAuthState, createOAuthState, createPkcePair, resolveReturnUrl } from './oauth';
import { platformName } from './platforms';
import { ConnectOption, getProvider } from './providers';
import { getAllContentByAccountId } from '../db/content';

const PENDING_TTL_MS = 15 * 60 * 1000;

export interface AccountSummary {
	id: string;
	platform: Platform;
	accountName: string | null;
	username: string;
	status: ConnectedAccountRow['status'];
}

function summary(row: ConnectedAccountRow): AccountSummary {
	return { id: row.id, platform: row.platform, accountName: row.account_name, username: row.account_username, status: row.status };
}

function requireConfigured(platform: Platform): void {
	const provider = getProvider(platform);
	if (!provider.isConfigured()) {
		// Setting names only (never values), for the operator.
		console.warn(`${platformName(platform)} OAuth is not configured. Missing: ${provider.missingConfiguration().join(', ')}`);
		throw new HttpError(503, 'CONFIG_ERROR', `${platformName(platform)} connection isn't configured on this server yet.`);
	}
}

/**
 * Connects one platform account for the user: refuses accounts already connected to another Media
 * Navigator user, stores the credential encrypted, upserts the account, and runs the first sync.
 */
export async function connectOption(userId: string, platform: Platform, option: ConnectOption, now: number): Promise<ConnectedAccountRow> {
	const existing = await findAccountByPlatformAndAccountId(platform, option.platformAccountId);
	if (existing && existing.user_id !== userId) {
		throw new HttpError(
			409,
			'ACCOUNT_ALREADY_CONNECTED',
			`This ${platformName(platform)} account is already connected to another Media Navigator user account.`,
		);
	}

	const tokenReference = await storePlatformCredentials(userId, option.credentials, now);
	let row: ConnectedAccountRow;
	try {
		const result = await upsertConnectedAccount({
			id: existing?.id ?? crypto.randomUUID(),
			userId,
			platform,
			platformAccountId: option.platformAccountId,
			accountName: option.accountName,
			accountUsername: option.accountUsername,
			profilePictureUrl: option.profilePictureUrl,
			status: 'connected',
			tokenReference,
			tokenExpiresAt: option.credentials.expiresAt ?? null,
			now,
		});
		row = result.row;
		if (result.replacedTokenReference) await deletePlatformCredentials(userId, result.replacedTokenReference);
	} catch (error) {
		await deletePlatformCredentials(userId, tokenReference);
		throw error;
	}

	await clearNotification(userId, `expired:${row.id}`);
	await notify(userId, {
		event: 'account_connected',
		kind: 'account',
		title: `${platformName(platform)} connected`,
		body: `@${row.account_username} is connected. Media Navigator is syncing its data now.`,
		connectedAccountId: row.id,
		dedupeKey: `connected:${row.id}`,
		now,
	});

	// The first sync runs immediately; its failure does not undo the connection (the user can retry).
	try {
		await syncConnectedAccount(userId, row.id, now);
	} catch {
		// Recorded as a sync run and a notification by syncConnectedAccount.
	}
	return (await findAccountById(row.id)) ?? row;
}

/** Manual connection with a user-supplied platform token (Instagram and Facebook Pages via Meta tokens). */
export async function connectWithAccessToken(userId: string, platform: Platform, accessToken: string, now: number) {
	const provider = getProvider(platform);
	if (!provider.optionsFromAccessToken) {
		requireConfigured(platform);
		return { authorizationUrl: await startAuthorization(userId, platform, null, now) };
	}
	const options = await provider.optionsFromAccessToken(accessToken);
	if (options.length === 1) return { account: summary(await connectOption(userId, platform, options[0], now)) };
	return { selection: await createPendingSelection(userId, platform, options, now) };
}

export async function startAuthorization(userId: string, platform: Platform, rawReturnUrl: string | null, now: number): Promise<string> {
	requireConfigured(platform);
	const provider = getProvider(platform);
	const returnUrl = resolveReturnUrl(rawReturnUrl);
	const pkce = provider.usesPkce ? await createPkcePair() : null;
	const state = await createOAuthState(userId, platform, returnUrl, { codeVerifier: pkce?.verifier, now });
	return provider.authorizationUrl(state, pkce?.challenge ?? null);
}

/** Handles the provider redirect and returns the app deep link to send the browser to. */
export async function completeAuthorization(
	platform: Platform,
	params: { code: string | null; state: string | null; error: string | null; errorDescription: string | null },
	now: number,
): Promise<string> {
	const stateRecord = await consumeOAuthState(params.state, platform, now);
	const returnUrl = stateRecord?.returnUrl ?? resolveReturnUrl(null);
	const fail = (message: string) => appRedirect(returnUrl, { status: 'error', platform, message });

	if (params.error) return fail(params.errorDescription || `${platformName(platform)} authorization was denied.`);
	if (!stateRecord) return fail('Invalid or expired state parameter.');
	if (!params.code) return fail('Missing code or state parameter.');

	try {
		const options = await getProvider(platform).completeAuthorization(params.code, stateRecord.codeVerifier);
		if (options.length === 1) {
			const row = await connectOption(stateRecord.userId, platform, options[0], now);
			return appRedirect(returnUrl, { status: 'success', platform, accountId: row.id });
		}
		const selection = await createPendingSelection(stateRecord.userId, platform, options, now);
		return appRedirect(returnUrl, { status: 'select', platform, selectionId: selection.id });
	} catch (error) {
		return fail(error instanceof HttpError ? error.message : `Failed to complete ${platformName(platform)} connection.`);
	}
}

interface PendingGrant {
	credentials: Record<string, PlatformCredentials>;
}

export interface PendingSelection {
	id: string;
	platform: Platform;
	options: PendingOption[];
	expiresAt: string;
}

async function createPendingSelection(userId: string, platform: Platform, options: ConnectOption[], now: number): Promise<PendingSelection> {
	const grant: PendingGrant = { credentials: Object.fromEntries(options.map((o) => [o.platformAccountId, o.credentials])) };
	const doc = await PendingConnection.create({
		_id: crypto.randomUUID(),
		userId,
		platform,
		options: options.map(({ credentials: _c, ...option }) => option),
		grant: await encryptJson(grant),
		expiresAt: new Date(now + PENDING_TTL_MS),
	});
	return { id: doc._id, platform, options: doc.toObject().options, expiresAt: doc.expiresAt.toISOString() };
}

export async function getPendingSelection(userId: string, id: string, now: number): Promise<PendingSelection> {
	const doc = await PendingConnection.findOne({ _id: id, userId }).lean();
	if (!doc || doc.expiresAt.getTime() <= now) throw new HttpError(404, 'SELECTION_NOT_FOUND', 'This connection request has expired. Please connect again.');
	return { id: doc._id, platform: doc.platform, options: doc.options, expiresAt: doc.expiresAt.toISOString() };
}

export async function completePendingSelection(userId: string, id: string, platformAccountId: string, now: number) {
	const doc = await PendingConnection.findOneAndDelete({ _id: id, userId }).lean();
	if (!doc || doc.expiresAt.getTime() <= now) throw new HttpError(404, 'SELECTION_NOT_FOUND', 'This connection request has expired. Please connect again.');
	const option = doc.options.find((o) => o.platformAccountId === platformAccountId);
	const grant = await decryptJson<PendingGrant>(doc.grant);
	const credentials = grant.credentials[platformAccountId];
	if (!option || !credentials) {
		throw new HttpError(400, 'VALIDATION_ERROR', 'Choose one of the listed accounts.', { platformAccountId: 'Unknown account.' });
	}
	return summary(await connectOption(userId, doc.platform, { ...option, credentials }, now));
}

export async function requireOwnedAccount(userId: string, accountId: string): Promise<ConnectedAccountRow> {
	const account = await findAccountById(accountId);
	if (!account || account.user_id !== userId) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Connected account not found.');
	return account;
}

/** Disconnect: deletes the credential, the account and all of its synced data. */
export async function disconnectAccount(userId: string, accountId: string, now: number): Promise<void> {
	const account = await requireOwnedAccount(userId, accountId);
	await deletePlatformCredentials(userId, account.token_reference);
	await deleteConnectedAccount(account.id, userId);
	await deleteAccountData(account.id);
	await Promise.all(
		['expired', 'syncfail', 'sync', 'connected', 'ai'].map((prefix) => clearNotification(userId, `${prefix}:${account.id}`)),
	);
	await notify(userId, {
		event: 'account_disconnected',
		kind: 'account',
		title: `${platformName(account.platform)} disconnected`,
		body: `@${account.account_username} was disconnected and its synced data was deleted from Media Navigator.`,
		now,
	});
}

const AUTH_ERROR_CODES = new Set(['REAUTHORIZATION_REQUIRED', 'INVALID_TOKEN']);

/** Syncs one account through its platform adapter and records the outcome as notifications. */
export async function syncConnectedAccount(userId: string, accountId: string, now: number, fetchImpl: typeof fetch = fetch): Promise<SyncSummary> {
	const account = await requireOwnedAccount(userId, accountId);
	const name = platformName(account.platform);
	try {
		const result = await getProvider(account.platform).sync(account, now, fetchImpl);
		await Promise.all([clearNotification(userId, `expired:${account.id}`), clearNotification(userId, `syncfail:${account.id}`)]);
		await notify(userId, {
			event: 'sync_completed',
			kind: 'account',
			title: `${name} sync completed`,
			body: `Synced ${result.postsSynced} ${result.postsSynced === 1 ? 'item' : 'items'} from @${account.account_username}.`,
			connectedAccountId: account.id,
			dedupeKey: `sync:${account.id}`,
			now,
		});
		await detectAnomalies(userId, account, now);
		return result;
	} catch (error) {
		if (error instanceof HttpError && AUTH_ERROR_CODES.has(error.code)) {
			await notify(userId, {
				event: 'connection_expired',
				kind: 'account',
				title: `Reconnect ${name}`,
				body: `Access to @${account.account_username} expired or was revoked. Reconnect it to keep your data up to date.`,
				connectedAccountId: account.id,
				dedupeKey: `expired:${account.id}`,
				now,
			});
		} else {
			await notify(userId, {
				event: 'sync_failed',
				kind: 'account',
				title: `${name} sync failed`,
				body: error instanceof HttpError ? error.message : `Syncing @${account.account_username} failed. Please try again.`,
				connectedAccountId: account.id,
				dedupeKey: `syncfail:${account.id}`,
				now,
			});
		}
		throw error;
	}
}

const ANOMALY_MULTIPLE = 3;
const ANOMALY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const MIN_POSTS_FOR_ANOMALY = 6;

/**
 * Flags a recent post whose measured interactions are at least 3× the account average. One
 * notification per post, ever; nothing is flagged without enough history to compare against.
 */
async function detectAnomalies(userId: string, account: ConnectedAccountRow, now: number): Promise<void> {
	try {
		const rows = await getAllContentByAccountId(account.id);
		const baseline = computeBaseline(rows);
		if (baseline.avgInteractions === null || baseline.avgInteractions <= 0 || baseline.sampleSize < MIN_POSTS_FOR_ANOMALY) return;
		for (const row of rows) {
			const interactions = interactionsOf(row.like_count, row.comments_count);
			const published = row.published_at ? Date.parse(row.published_at) : NaN;
			if (interactions === null || Number.isNaN(published) || now - published > ANOMALY_WINDOW_MS) continue;
			const multiple = interactions / baseline.avgInteractions;
			if (multiple < ANOMALY_MULTIPLE) continue;
			await notify(userId, {
				event: 'performance_anomaly',
				kind: 'insight',
				title: 'A recent post is outperforming',
				body: `A ${row.format.toLowerCase()} published ${new Date(published).toISOString().slice(0, 10)} has ${interactions} interactions — ${multiple.toFixed(1)}× the @${account.account_username} average of ${baseline.avgInteractions}.`,
				connectedAccountId: account.id,
				dedupeKey: `anomaly:${row.id}`,
				onlyOnce: true,
				now,
			});
		}
	} catch (error) {
		console.error('Anomaly detection failed', { accountId: account.id, error: error instanceof Error ? error.message : String(error) });
	}
}

import type { ConnectedAccountRow } from '../../db/accounts';
import type { Platform, PendingOption, SyncMode } from '../../models';
import type { PlatformCredentials } from '../credentials';
import type { SyncSummary } from '../instagramSync';

/** One account the user can connect after authorizing, with the credential that reads it. */
export interface ConnectOption extends PendingOption {
	credentials: PlatformCredentials;
}

/**
 * A social platform adapter. Every implementation talks only to the platform's official, documented
 * API; metrics a platform does not return are stored as null, never estimated.
 */
export interface SocialProvider {
	platform: Platform;
	/** Whether the server has the OAuth app credentials this platform needs. */
	isConfigured(): boolean;
	/** Human-readable list of missing server settings, for the CONFIG_ERROR message. */
	missingConfiguration(): string[];
	usesPkce: boolean;
	authorizationUrl(state: string, codeChallenge: string | null): string;
	/** Exchanges the authorization code and lists the accounts this grant can read. */
	completeAuthorization(code: string, codeVerifier: string | null, fetchImpl?: typeof fetch): Promise<ConnectOption[]>;
	/** Lists connectable accounts for a user-supplied access token (manual connection), when the platform supports it. */
	optionsFromAccessToken?(accessToken: string, fetchImpl?: typeof fetch): Promise<ConnectOption[]>;
	/** Pulls profile metrics and content into MongoDB. */
	sync(account: ConnectedAccountRow, now: number, fetchImpl?: typeof fetch, options?: { mode?: SyncMode }): Promise<SyncSummary>;
}

/** The platform rejected the credential (expired/revoked/insufficient scope): the user must reconnect. */
export class ProviderAuthError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProviderAuthError';
	}
}

/** Any other platform API failure. `message` must never contain a token. */
export class ProviderApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = 'ProviderApiError';
	}
}

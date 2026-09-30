import { getConfig } from '../../config/env';
import {
	buildInstagramAuthorizationUrl,
	exchangeInstagramCode,
	fetchInstagramAccountInfo,
	isInstagramOAuthConfigured,
} from '../instagram';
import { syncInstagramAccount } from '../instagramSync';
import type { ConnectOption, SocialProvider } from './types';

async function optionsFromToken(accessToken: string, expiresAt: number | null, fetchImpl: typeof fetch = fetch): Promise<ConnectOption[]> {
	const info = await fetchInstagramAccountInfo(accessToken, fetchImpl);
	return [
		{
			platformAccountId: info.platformAccountId,
			accountName: info.accountName,
			accountUsername: info.accountUsername,
			profilePictureUrl: info.profilePictureUrl,
			credentials: { accessToken: accessToken.trim(), expiresAt },
		},
	];
}

export const instagramProvider: SocialProvider = {
	platform: 'instagram',
	usesPkce: false,
	isConfigured: isInstagramOAuthConfigured,
	missingConfiguration() {
		const config = getConfig();
		return (['META_APP_ID', 'META_APP_SECRET', 'META_REDIRECT_URI'] as const).filter((key) => !config[key]);
	},
	authorizationUrl: (state) => buildInstagramAuthorizationUrl(state),
	async completeAuthorization(code, _verifier, fetchImpl = fetch) {
		const { accessToken, expiresAt } = await exchangeInstagramCode(code, fetchImpl);
		return optionsFromToken(accessToken, expiresAt, fetchImpl);
	},
	optionsFromAccessToken: (accessToken, fetchImpl) => optionsFromToken(accessToken, null, fetchImpl),
	sync: (account, now, fetchImpl) => syncInstagramAccount(account, now, fetchImpl),
};

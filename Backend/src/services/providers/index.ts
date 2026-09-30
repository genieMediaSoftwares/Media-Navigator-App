import type { Platform } from '../../models';
import { facebookProvider } from './facebook';
import { instagramProvider } from './instagram';
import { linkedinProvider } from './linkedin';
import type { SocialProvider } from './types';
import { youtubeProvider } from './youtube';

const PROVIDERS: Record<Platform, SocialProvider> = {
	instagram: instagramProvider,
	facebook: facebookProvider,
	youtube: youtubeProvider,
	linkedin: linkedinProvider,
};

export function getProvider(platform: Platform): SocialProvider {
	return PROVIDERS[platform];
}

export type { ConnectOption, SocialProvider } from './types';

import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';

import { SocialPlatform } from '@/types/api';

// Platforms the app can offer to connect. This is UI configuration (names and icons),
// not account data: whether an account is connected always comes from the API.
export interface PlatformOption {
  id: SocialPlatform;
  name: string;
  icon: ComponentProps<typeof Ionicons>['name'];
}

export const PLATFORMS: readonly PlatformOption[] = [
  { id: 'instagram', name: 'Instagram', icon: 'logo-instagram' },
  { id: 'youtube', name: 'YouTube', icon: 'logo-youtube' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'logo-linkedin' },
  { id: 'facebook', name: 'Facebook', icon: 'logo-facebook' },
];

export function platformOption(id: SocialPlatform): PlatformOption {
  const option = PLATFORMS.find((platform) => platform.id === id);
  if (!option) throw new Error(`Unknown platform: ${id}`);
  return option;
}

/** Route to a platform's account screen (connect flow when not connected). */
export function accountHref(platform: SocialPlatform) {
  return platform === 'instagram' ? ('/connect/instagram' as const) : { pathname: '/connect/[platform]' as const, params: { platform } };
}

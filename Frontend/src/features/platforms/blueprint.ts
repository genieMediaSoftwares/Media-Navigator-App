import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';

import { colors } from '@/constants/colors';
import { SocialPlatform } from '@/types/api';

// How each platform is presented in the connect flow. Product configuration (names and copy), not
// data. Content-type vocabulary per platform lives in features/intelligence/labels.ts.

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface PlatformBlueprint {
  id: SocialPlatform;
  name: string;
  icon: IconName;
  accent: string;
  /** "Page", "Channel", "Organization", "Account". */
  accountNoun: string;
  /** Title of the "choose which one" step after sign-in. */
  selectTitle: string;
  selectHint: string;
  connect: { requirement: string; access: string };
}

export const BLUEPRINTS: Record<SocialPlatform, PlatformBlueprint> = {
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    icon: 'logo-instagram',
    accent: colors.magenta,
    accountNoun: 'Account',
    selectTitle: 'Choose an Instagram account',
    selectHint: 'Business and Creator accounts linked to your Facebook Pages.',
    connect: {
      requirement: 'You need an Instagram Business or Creator account.',
      access: 'Media Navigator asks Meta for read-only access to your media and insights.',
    },
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    icon: 'logo-facebook',
    accent: colors.primaryBright,
    accountNoun: 'Page',
    selectTitle: 'Choose a Facebook Page',
    selectHint: 'Pages where you have a role.',
    connect: {
      requirement: 'You need a role on the Facebook Page you want to connect.',
      access: 'Media Navigator asks Meta for read-only access to your Pages’ posts and insights.',
    },
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    icon: 'logo-youtube',
    accent: colors.danger,
    accountNoun: 'Channel',
    selectTitle: 'Choose a YouTube channel',
    selectHint: 'Channels your Google account owns or manages.',
    connect: {
      requirement: 'Sign in with the Google account that owns or manages the channel.',
      access: 'Media Navigator asks Google for read-only access to your channel, videos and YouTube Analytics.',
    },
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: 'logo-linkedin',
    accent: colors.primary,
    accountNoun: 'Organization',
    selectTitle: 'Choose a LinkedIn page',
    selectHint: 'Company pages you administer.',
    connect: {
      requirement: 'You need to be an administrator of the LinkedIn company page.',
      access: 'Media Navigator asks LinkedIn for read-only access to your organization’s posts and statistics.',
    },
  },
};

export function blueprintOf(platform: SocialPlatform): PlatformBlueprint {
  return BLUEPRINTS[platform];
}

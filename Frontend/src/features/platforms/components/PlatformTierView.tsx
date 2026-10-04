import { SocialPlatform } from '@/types/api';
import { Tier } from '../blueprint';
import { PlatformIntelligenceView } from './PlatformIntelligenceView';

interface PlatformTierViewProps {
  platform: SocialPlatform;
  tier: Tier;
  onSelectPlatform?: (platform: SocialPlatform) => void;
}

export function PlatformTierView({ platform, tier, onSelectPlatform }: PlatformTierViewProps) {
  return <PlatformIntelligenceView platform={platform} initialTier={tier} onSelectPlatform={onSelectPlatform} />;
}

import { ScrollView, View } from 'react-native';

import { MetricPill, MetricStrip } from '@/components/visual/Metrics';
import { SocialPlatform } from '@/types/api';
import { blueprintOf, formatMetric } from '../blueprint';

interface PlatformMetricStripProps {
  platform: SocialPlatform;
  metrics: Record<string, number | null | undefined>;
  mode?: 'strip' | 'pills';
}

export function PlatformMetricStrip({ platform, metrics, mode = 'strip' }: PlatformMetricStripProps) {
  const bp = blueprintOf(platform);

  // Map blueprint card metrics or primary metrics
  const cardKeys = bp.cardMetrics;
  const cardItems = cardKeys
    .map((key) => {
      const spec = bp.metrics.find((m) => m.key === key);
      if (!spec) return null;
      const formatted = formatMetric(metrics[key], spec.kind);
      return {
        label: spec.label,
        value: formatted,
      };
    })
    .filter((item): item is { label: string; value: string | null } => item !== null);

  if (mode === 'strip') {
    return <MetricStrip metrics={cardItems} />;
  }

  // All metrics pills
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-xl my-sm" contentContainerClassName="px-xl">
      {bp.metrics.map((spec) => {
        const val = metrics[spec.key];
        const formatted = formatMetric(val, spec.kind);
        return <MetricPill key={spec.key} icon="stats-chart-outline" label={spec.label.toLowerCase()} value={formatted} />;
      })}
    </ScrollView>
  );
}

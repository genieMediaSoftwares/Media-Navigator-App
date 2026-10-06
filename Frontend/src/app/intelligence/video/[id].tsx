import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { VideoAnalysisView } from '@/features/analysis/components/VideoAnalysisView';

/** Deep Video Analysis for one Reel or video (opened from Top Performers / Needs Improvement). */
export default function VideoAnalysisScreen() {
  const { id, accountId } = useLocalSearchParams<{ id: string; accountId?: string }>();
  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-xl pb-3xl pt-lg">
      <VideoAnalysisView accountId={accountId || null} postId={id} autoStart />
    </ScrollView>
  );
}

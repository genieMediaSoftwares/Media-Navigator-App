import { ScrollView, Text, View } from 'react-native';

export interface DocumentSection {
  title: string;
  paragraphs: string[];
}

/** Long-form text (help, policies) in the app's reading style. */
export function DocumentScreen({ intro, updated, sections }: { intro?: string; updated?: string; sections: DocumentSection[] }) {
  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-xl pb-3xl pt-lg">
      {updated ? <Text className="mb-sm text-caption text-neutral-500">Last updated {updated}</Text> : null}
      {intro ? <Text className="mb-xl text-body text-neutral-500">{intro}</Text> : null}
      {sections.map((section) => (
        <View key={section.title} className="mb-xl">
          <Text className="mb-sm text-title text-navy" accessibilityRole="header">
            {section.title}
          </Text>
          {section.paragraphs.map((paragraph, index) => (
            <Text key={index} className="mb-sm text-label font-normal leading-6 text-neutral-500">
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

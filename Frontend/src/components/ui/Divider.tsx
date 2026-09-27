import { View } from 'react-native';

/** Hairline separator. `inset` aligns it with list-row text that follows a leading icon. */
export function Divider({ inset = false }: { inset?: boolean }) {
  return <View className={`h-px bg-neutral-200 ${inset ? 'ml-[52px]' : ''}`} />;
}

import { Href, Link } from 'expo-router';
import { Pressable, Text } from 'react-native';

interface TextLinkProps {
  href: Href;
  label: string;
  replace?: boolean;
}

/** In-app text link with a full 44dp touch target. */
export function TextLink({ href, label, replace = false }: TextLinkProps) {
  return (
    <Link href={href} replace={replace} asChild>
      <Pressable accessibilityRole="link" className="min-h-11 justify-center rounded-md px-xs active:bg-sky">
        <Text className="text-label font-semibold text-primary">{label}</Text>
      </Pressable>
    </Link>
  );
}

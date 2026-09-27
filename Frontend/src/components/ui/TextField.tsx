import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, useState } from 'react';
import { Pressable, Text, TextInput, TextInputProps, View } from 'react-native';

import { colors } from '@/constants/colors';
import { inputVariants } from '@/constants/variants';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  /** Optional guidance shown under the field when there is no error. */
  hint?: string;
  /** Renders a show/hide toggle and masks the value by default. */
  secureToggle?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, secureToggle = false, editable = true, ...inputProps },
  ref,
) {
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);

  const variant = !editable ? 'disabled' : error ? 'error' : focused ? 'focused' : 'default';

  return (
    <View className="mb-lg">
      <Text className="mb-xs text-label text-navy">{label}</Text>
      <View className={`min-h-12 flex-row items-center rounded-lg border px-lg ${inputVariants[variant]}`}>
        <TextInput
          ref={ref}
          className="flex-1 py-md text-body text-navy"
          placeholderTextColor={colors.placeholder}
          secureTextEntry={secureToggle && hidden}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          editable={editable}
          {...inputProps}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
        />
        {secureToggle && (
          <Pressable
            onPress={() => setHidden((value) => !value)}
            hitSlop={12}
            className="ml-sm h-11 w-11 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={22} color={colors.neutral500} />
          </Pressable>
        )}
      </View>
      {error ? (
        <View className="mt-xs flex-row items-center" accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text className="ml-xs flex-1 text-caption text-danger">{error}</Text>
        </View>
      ) : hint ? (
        <Text className="mt-xs text-caption text-neutral-500">{hint}</Text>
      ) : null}
    </View>
  );
});

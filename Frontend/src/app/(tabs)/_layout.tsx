import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { ComponentProps } from 'react';
import { ColorValue } from 'react-native';

import { colors } from '@/constants/colors';
import { typography } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Filled icon when active, outline when inactive, so selection is not conveyed by color alone.
function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} color={color} size={size} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.neutral500,
        tabBarLabelStyle: { fontSize: 12, fontWeight: typography.label.fontWeight },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.skyBorder },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen name="intelligence" options={{ title: 'Intelligence', tabBarIcon: tabIcon('bulb', 'bulb-outline') }} />
      <Tabs.Screen name="planner" options={{ title: 'Planner', tabBarIcon: tabIcon('calendar', 'calendar-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('person-circle', 'person-circle-outline') }} />
    </Tabs>
  );
}

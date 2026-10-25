// Navigation shell (N-3.6 del 6): root native stack → bottom tabs per docs/design/d1-v2.
// First launch (settings.welcomeSeen false) shows Välkommen instead of the navigator.

import { useMemo } from 'react';
import { View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import DevScreen from '../DevScreen';
import { useSettings } from '../state';
import { textStyle, useTheme } from '../ui';
import {
  AnalysisContainer,
  HistoryContainer,
  LiveSessionContainer,
  ResultContainer,
  RulesContainer,
  UploadContainer,
  WelcomeContainer,
} from './containers';
import type { RootStackParamList, TabParamList } from './routes';
import { TabIcon } from './TabIcon';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_LABEL: Record<keyof TabParamList, string> = {
  Swing: 'Sving',
  Session: 'Session',
  Rules: 'Regler',
  History: 'Historik',
};

function Tabs() {
  const theme = useTheme();
  const { colors } = theme;
  const label = textStyle(theme, 'caption', 600);
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabel: TAB_LABEL[route.name],
        tabBarIcon: ({ color }) => <TabIcon tab={route.name} color={color} />,
        // d1-v2 .tabbar: chrome surface, hairline top border, 10.5 pt Outfit 600 labels.
        // OSÄKER: no backdrop blur (would need expo-blur); chrome is already 82 % opaque.
        // Risk: low — visual only.
        tabBarStyle: { backgroundColor: colors.chrome, borderTopColor: colors.lineStrong, borderTopWidth: 0.5, position: 'absolute' },
        tabBarLabelStyle: { ...label, fontSize: 10.5, lineHeight: 12, letterSpacing: 0.1 },
      })}
    >
      <Tab.Screen name="Swing" component={UploadContainer} />
      <Tab.Screen name="Session" component={LiveSessionContainer} />
      <Tab.Screen name="Rules" component={RulesContainer} />
      <Tab.Screen
        name="History"
        component={HistoryContainer}
        // Dev builds only: long-press the Historik tab to open DevScreen (pose/parity checks).
        listeners={({ navigation }) => ({
          tabLongPress: () => {
            if (__DEV__) navigation.getParent()?.navigate('Dev');
          },
        })}
      />
    </Tab.Navigator>
  );
}

export function Navigation() {
  const { colors, scheme } = useTheme();
  const { settings, ready } = useSettings();
  const navTheme = useMemo<NavTheme>(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, primary: colors.accent, background: colors.bg, card: colors.surface, text: colors.fg, border: colors.line },
    };
  }, [scheme, colors]);

  // Before hydration we cannot know whether this is the first launch — show the bare background.
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!settings.welcomeSeen) return <WelcomeContainer />;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Analysis" component={AnalysisContainer} options={{ gestureEnabled: false }} />
        <Stack.Screen name="Result" component={ResultContainer} />
        {__DEV__ && <Stack.Screen name="Dev" component={DevScreen} options={{ headerShown: true, title: 'Dev' }} />}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

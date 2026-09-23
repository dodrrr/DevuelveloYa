import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppProvider } from '@/context/AppContext';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();
const queryClient = new QueryClient();

function RootLayoutNav() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}><Stack.Screen name="index" /><Stack.Screen name="detail" /><Stack.Screen name="history" /><Stack.Screen name="settings" /><Stack.Screen name="upload" options={{ presentation: 'formSheet', animation: 'slide_from_bottom', sheetAllowedDetents: [0.78, 1], sheetGrabberVisible: true, contentStyle: { backgroundColor: 'transparent' } }} /></Stack>;
}

export default function RootLayout() {
  useEffect(() => { SplashScreen.hideAsync(); }, []);
  return <SafeAreaProvider><ErrorBoundary><QueryClientProvider client={queryClient}><AppProvider><GestureHandlerRootView style={{ flex: 1 }}><KeyboardProvider><RootLayoutNav /></KeyboardProvider></GestureHandlerRootView></AppProvider></QueryClientProvider></ErrorBoundary></SafeAreaProvider>;
}

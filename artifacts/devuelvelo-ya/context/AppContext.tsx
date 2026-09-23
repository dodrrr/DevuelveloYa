import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import colors, { Appearance, ThemeColors } from '@/constants/colors';

export type ReturnItem = {
  id: string;
  title: string;
  store: string;
  initials: string;
  accent: string;
  price: number;
  purchaseDate: string;
  deadline: string;
  daysLeft: number;
  totalDays: number;
  returnsUrl: string;
};

export const seedReturns: ReturnItem[] = [
  { id: 'nike-air-max', title: 'Air Max 90', store: 'Nike', initials: 'N', accent: '#111111', price: 129.99, purchaseDate: '28 ago 2026', deadline: '12 sep 2026', daysLeft: 2, totalDays: 30, returnsUrl: 'https://www.nike.com/es/help/a/devoluciones' },
  { id: 'sony-headphones', title: 'WH-1000XM5', store: 'Amazon', initials: 'a', accent: '#FF9900', price: 279.00, purchaseDate: '25 ago 2026', deadline: '16 sep 2026', daysLeft: 6, totalDays: 30, returnsUrl: 'https://www.amazon.es/gp/css/returns/homepage.html' },
  { id: 'tech-jacket', title: 'Chaqueta técnica', store: 'Zalando', initials: 'Z', accent: '#6B4EFF', price: 89.95, purchaseDate: '18 ago 2026', deadline: '28 sep 2026', daysLeft: 14, totalDays: 30, returnsUrl: 'https://www.zalando.es/faq/Devoluciones/' },
  { id: 'portable-lamp', title: 'Lámpara portátil', store: 'HAY', initials: 'H', accent: '#E66A3C', price: 75.00, purchaseDate: '04 ago 2026', deadline: '04 oct 2026', daysLeft: 28, totalDays: 60, returnsUrl: 'https://hay.com/pages/returns' },
];

type AppContextValue = {
  returns: ReturnItem[];
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
  colors: ThemeColors;
  systemScheme: 'light' | 'dark';
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  notificationDays: number;
  setNotificationDays: (days: number) => void;
  removeReturn: (id: string) => void;
  markReturned: (id: string) => void;
  hydrated: boolean;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [returns, setReturns] = useState<ReturnItem[]>(seedReturns);
  const [appearance, setAppearance] = useState<Appearance>('system');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationDays, setNotificationDays] = useState(3);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet(['devuelvelo_returns', 'devuelvelo_settings'])
      .then(([returnsEntry, settingsEntry]) => {
        if (returnsEntry[1]) {
          try { setReturns(JSON.parse(returnsEntry[1]) as ReturnItem[]); } catch { setReturns(seedReturns); }
        }
        if (settingsEntry[1]) {
          try {
            const parsed = JSON.parse(settingsEntry[1]) as { appearance?: Appearance; notificationsEnabled?: boolean; notificationDays?: number };
            if (parsed.appearance) setAppearance(parsed.appearance);
            if (typeof parsed.notificationsEnabled === 'boolean') setNotificationsEnabled(parsed.notificationsEnabled);
            if (parsed.notificationDays) setNotificationDays(parsed.notificationDays);
          } catch { /* keep defaults */ }
        }
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.multiSet([
      ['devuelvelo_returns', JSON.stringify(returns)],
      ['devuelvelo_settings', JSON.stringify({ appearance, notificationsEnabled, notificationDays })],
    ]).catch(() => undefined);
  }, [appearance, hydrated, notificationDays, notificationsEnabled, returns]);

  const activeColors = useMemo(() => {
    const scheme = appearance === 'system' ? systemScheme : appearance;
    return scheme === 'dark' ? colors.dark : colors.light;
  }, [appearance, systemScheme]);

  const value = useMemo<AppContextValue>(() => ({
    returns,
    appearance,
    setAppearance,
    colors: activeColors,
    systemScheme,
    notificationsEnabled,
    setNotificationsEnabled,
    notificationDays,
    setNotificationDays,
    removeReturn: (id) => setReturns((current) => current.filter((item) => item.id !== id)),
    markReturned: (id) => setReturns((current) => current.filter((item) => item.id !== id)),
    hydrated,
  }), [activeColors, appearance, hydrated, notificationDays, notificationsEnabled, returns, systemScheme]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}

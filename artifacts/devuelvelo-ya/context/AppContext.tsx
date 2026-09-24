import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import colors, { Appearance, ThemeColors } from '@/constants/colors';
import { daysUntil, parseDate } from '@/utils/return-dates';

export type ReturnItem = {
  id: string;
  title: string;
  store: string;
  initials: string;
  accent: string;
  price: number;
  purchaseDate: string;
  deadline: string;
  returnsUrl: string;
  returnOption?: string;
  completedAt?: string;
  outcome?: 'in_progress' | 'refunded';
};

export type ReturnDraft = Pick<ReturnItem, 'title' | 'store' | 'price' | 'purchaseDate' | 'deadline' | 'returnsUrl'>;

type AppContextValue = {
  returns: ReturnItem[];
  history: ReturnItem[];
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
  colors: ThemeColors;
  systemScheme: 'light' | 'dark';
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  notificationDays: number;
  setNotificationDays: (days: number) => void;
  addReturn: (draft: ReturnDraft) => void;
  updateReturn: (id: string, draft: ReturnDraft) => void;
  setReturnOption: (id: string, option: string | undefined) => void;
  removeReturn: (id: string) => void;
  markReturned: (id: string, outcome?: ReturnItem['outcome']) => void;
  markRefunded: (id: string) => void;
  hydrated: boolean;
};

const sampleIds = new Set(['nike-air-max', 'sony-headphones', 'tech-jacket', 'portable-lamp']);
const AppContext = createContext<AppContextValue | null>(null);

function initialsFor(store: string) {
  return store.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'DV';
}

function accentFor(store: string) {
  const accents = ['#A34F2B', '#76604C', '#52715B', '#A27637', '#996356'];
  return accents[[...store].reduce((sum, char) => sum + char.charCodeAt(0), 0) % accents.length];
}

function normalizeItem(value: ReturnItem): ReturnItem | null {
  if (!value || typeof value.id !== 'string' || typeof value.title !== 'string') return null;
  if (sampleIds.has(value.id)) return null;
  const purchaseDate = parseDate(value.purchaseDate);
  const deadline = parseDate(value.deadline);
  if (!purchaseDate || !deadline) return null;
  const store = String(value.store || 'Tienda');
  return {
    ...value,
    id: value.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: value.title.trim(),
    store,
    initials: initialsFor(store),
    accent: accentFor(store),
    price: Number.isFinite(Number(value.price)) ? Number(value.price) : 0,
    purchaseDate,
    deadline,
    returnsUrl: typeof value.returnsUrl === 'string' ? value.returnsUrl : '',
  };
}

export function daysLeftFor(item: ReturnItem) {
  return daysUntil(item.deadline);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [history, setHistory] = useState<ReturnItem[]>([]);
  const [appearance, setAppearance] = useState<Appearance>('system');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationDays, setNotificationDays] = useState(3);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet(['devuelvelo_returns', 'devuelvelo_settings', 'devuelvelo_history'])
      .then(([returnsEntry, settingsEntry, historyEntry]) => {
        if (returnsEntry[1]) {
          try {
            const parsed = JSON.parse(returnsEntry[1]) as ReturnItem[];
            setReturns(Array.isArray(parsed) ? parsed.map(normalizeItem).filter((item): item is ReturnItem => Boolean(item)) : []);
          } catch { setReturns([]); }
        }
        if (historyEntry[1]) {
          try {
            const parsed = JSON.parse(historyEntry[1]) as ReturnItem[];
            setHistory(Array.isArray(parsed) ? parsed.map(normalizeItem).filter((item): item is ReturnItem => Boolean(item)) : []);
          } catch { setHistory([]); }
        }
        if (settingsEntry[1]) {
          try {
            const parsed = JSON.parse(settingsEntry[1]) as { appearance?: Appearance; notificationsEnabled?: boolean; notificationDays?: number };
            if (parsed.appearance) setAppearance(parsed.appearance);
            if (typeof parsed.notificationsEnabled === 'boolean') setNotificationsEnabled(parsed.notificationsEnabled);
            if ([1, 3, 5, 7].includes(parsed.notificationDays ?? -1)) setNotificationDays(parsed.notificationDays!);
          } catch { /* Retain safe defaults when stored preferences are malformed. */ }
        }
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.multiSet([
      ['devuelvelo_returns', JSON.stringify(returns)],
      ['devuelvelo_history', JSON.stringify(history)],
      ['devuelvelo_settings', JSON.stringify({ appearance, notificationsEnabled, notificationDays })],
    ]).catch(() => undefined);
  }, [appearance, history, hydrated, notificationDays, notificationsEnabled, returns]);

  const activeColors = useMemo(() => {
    const scheme = appearance === 'system' ? systemScheme : appearance;
    return scheme === 'dark' ? colors.dark : colors.light;
  }, [appearance, systemScheme]);

  const value = useMemo<AppContextValue>(() => ({
    returns,
    history,
    appearance,
    setAppearance,
    colors: activeColors,
    systemScheme,
    notificationsEnabled,
    setNotificationsEnabled,
    notificationDays,
    setNotificationDays,
    addReturn: (draft) => {
      const store = draft.store.trim();
      const normalized = normalizeItem({ ...draft, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, store, initials: initialsFor(store), accent: accentFor(store) });
      if (normalized) setReturns((current) => [normalized, ...current]);
    },
    updateReturn: (id, draft) => setReturns((current) => current.map((item) => {
      if (item.id !== id) return item;
      const store = draft.store.trim();
      return { ...item, ...draft, store, initials: initialsFor(store), accent: accentFor(store) };
    })),
    setReturnOption: (id, option) => setReturns((current) => current.map((item) => item.id === id ? { ...item, returnOption: option } : item)),
    removeReturn: (id) => setReturns((current) => current.filter((item) => item.id !== id)),
    markReturned: (id, outcome = 'in_progress') => {
      const item = returns.find((entry) => entry.id === id);
      if (!item) return;
      setHistory((past) => [{ ...item, completedAt: new Date().toISOString(), outcome }, ...past]);
      setReturns((current) => current.filter((entry) => entry.id !== id));
    },
    markRefunded: (id) => setHistory((current) => current.map((item) => item.id === id ? { ...item, outcome: 'refunded' } : item)),
    hydrated,
  }), [activeColors, appearance, history, hydrated, notificationDays, notificationsEnabled, returns, systemScheme]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}

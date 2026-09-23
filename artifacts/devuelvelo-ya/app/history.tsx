import React, { useMemo } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReturnItem, useApp } from '@/context/AppContext';
import { formatDate } from '@/utils/return-dates';

function formatPrice(price: number) { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(price); }

export default function HistoryScreen() {
  const { colors, history, markRefunded } = useApp();
  const insets = useSafeAreaInsets();
  const sorted = useMemo(() => [...history].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')), [history]);
  const received = sorted.filter((item) => item.outcome === 'refunded').reduce((sum, item) => sum + item.price, 0);

  const confirmRefund = (item: ReturnItem) => Alert.alert('¿Ya recibiste el dinero?', `Confirma que ${formatPrice(item.price)} ya se abonó en tu cuenta.`, [
    { text: 'Todavía no', style: 'cancel' },
    { text: 'Sí, recibido', onPress: async () => { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); markRefunded(item.id); } },
  ]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 105, flexGrow: 1 }]}
        ListHeaderComponent={<View><View style={styles.header}><Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.card }]} accessibilityLabel="Volver"><Feather name="chevron-left" size={23} color={colors.foreground} /></Pressable><Text style={[styles.brand, { color: colors.mutedForeground }]}>DEVUÉLVELOYA</Text><Pressable onPress={() => router.push('/settings')} style={[styles.backButton, { backgroundColor: colors.card }]} accessibilityLabel="Ajustes"><Feather name="settings" size={18} color={colors.foreground} /></Pressable></View><Text style={[styles.title, { color: colors.foreground }]}>Historial</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Compras que ya no tienes que perseguir.</Text>{sorted.length ? <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.summaryIcon, { backgroundColor: colors.successSoft }]}><Feather name="check" size={16} color={colors.success} /></View><View style={styles.summaryCopy}><Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>REEMBOLSOS RECIBIDOS</Text><Text style={[styles.summaryAmount, { color: colors.foreground }]}>{formatPrice(received)}</Text></View><Text style={[styles.summaryCount, { color: colors.mutedForeground }]}>{sorted.length} {sorted.length === 1 ? 'devolución' : 'devoluciones'}</Text></View> : null}<Text style={[styles.section, { color: colors.foreground }]}>Devoluciones anteriores</Text></View>}
        ItemSeparatorComponent={() => <View style={{ height: 9 }} />}
        renderItem={({ item }) => <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.storeMark, { backgroundColor: item.accent }]}><Text style={styles.initial}>{item.initials}</Text></View><View style={styles.copy}><Text numberOfLines={1} style={[styles.itemTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{item.store} · {formatPrice(item.price)}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{item.completedAt ? `Actualizado ${formatDate(item.completedAt.slice(0, 10))}` : 'En historial'}</Text></View><View style={[styles.status, { backgroundColor: item.outcome === 'refunded' ? colors.successSoft : colors.warningSoft }]}><Text style={[styles.statusText, { color: item.outcome === 'refunded' ? colors.success : colors.warning }]}>{item.outcome === 'refunded' ? 'Recibido' : 'En curso'}</Text></View>{item.outcome !== 'refunded' ? <Pressable onPress={() => confirmRefund(item)} style={[styles.checkButton, { backgroundColor: colors.accent }]} accessibilityLabel={`Marcar reembolso de ${item.title} como recibido`}><Feather name="check" size={16} color={colors.primary} /></Pressable> : null}</View>}
        ListEmptyComponent={<View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.emptyIcon, { backgroundColor: colors.accent }]}><Feather name="archive" size={23} color={colors.primary} /></View><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Tu historial aparecerá aquí</Text><Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Cuando inicies una devolución, podrás seguir aquí el reembolso hasta recibirlo.</Text><Pressable onPress={() => router.replace('/')} style={[styles.emptyAction, { backgroundColor: colors.primary }]}><Text style={styles.emptyActionText}>Ver compras activas</Text></Pressable></View>}
      />
      <View style={[styles.bottomNav, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 5 }]}><Pressable onPress={() => router.replace('/')} style={styles.navItem}><Feather name="clock" size={19} color={colors.mutedForeground} /><Text style={[styles.navLabel, { color: colors.mutedForeground }]}>Activas</Text></Pressable><View style={styles.navItem}><Feather name="archive" size={19} color={colors.primary} /><Text style={[styles.navLabel, { color: colors.primary }]}>Historial</Text></View><Pressable onPress={() => router.push('/settings')} style={styles.navItem}><Feather name="settings" size={19} color={colors.mutedForeground} /><Text style={[styles.navLabel, { color: colors.mutedForeground }]}>Ajustes</Text></Pressable></View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 22 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  backButton: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  title: { fontSize: 33, fontWeight: '700', letterSpacing: -1 },
  subtitle: { fontSize: 14, marginTop: 4, marginBottom: 22 },
  summary: { minHeight: 76, borderRadius: 19, borderWidth: 1, flexDirection: 'row', alignItems: 'center', padding: 13, gap: 11, marginBottom: 25 },
  summaryIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1, gap: 4 },
  summaryLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.75 },
  summaryAmount: { fontSize: 17, fontWeight: '700' },
  summaryCount: { fontSize: 10 },
  section: { fontSize: 19, fontWeight: '700', marginBottom: 12 },
  card: { minHeight: 76, borderRadius: 17, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  storeMark: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  itemTitle: { fontSize: 13, fontWeight: '600' },
  meta: { fontSize: 10 },
  status: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  statusText: { fontSize: 9, fontWeight: '700' },
  checkButton: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  empty: { borderRadius: 21, borderWidth: 1, padding: 24, alignItems: 'center', marginTop: 2 },
  emptyIcon: { width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 7 },
  emptyText: { fontSize: 12, textAlign: 'center', lineHeight: 19 },
  emptyAction: { minHeight: 43, borderRadius: 13, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  emptyActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  bottomNav: { position: 'absolute', left: 20, right: 20, bottom: 0, minHeight: 61, borderRadius: 18, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 9 },
  navItem: { minWidth: 78, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4 },
  navLabel: { fontSize: 10, fontWeight: '600' },
});

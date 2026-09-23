import React, { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { daysLeftFor, useApp } from '@/context/AppContext';
import { formatDate, urgencyLabel } from '@/utils/return-dates';

function formatPrice(price: number) { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(price); }

export default function DetailScreen() {
  const { colors, returns, setReturnOption, markReturned, removeReturn } = useApp();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = returns.find((entry) => entry.id === id);
  const [busy, setBusy] = useState(false);
  if (!item) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={[styles.missingTitle, { color: colors.foreground }]}>Compra no encontrada</Text><Text style={[styles.missingCopy, { color: colors.mutedForeground }]}>Puede que ya esté en tu historial.</Text><Pressable onPress={() => router.back()} style={styles.backLink}><Text style={{ color: colors.primary, fontWeight: '600' }}>Volver a mis compras</Text></Pressable></View>;

  const days = daysLeftFor(item);
  const urgent = days <= 2;
  const tone = days <= 2 ? colors.destructive : days <= 7 ? colors.warning : colors.success;
  const dueCopy = days < 0 ? 'El plazo indicado ya ha pasado' : days === 0 ? 'Último día para devolverlo' : days === 1 ? 'Mañana es el último día' : `Tienes ${days} días para decidir`;

  const openReturns = async () => {
    if (!item.returnsUrl) {
      Alert.alert('Añade un enlace', 'Edita la compra y guarda el enlace oficial de devolución de esta tienda.');
      return;
    }
    try { await Linking.openURL(item.returnsUrl); }
    catch { Alert.alert('No se pudo abrir', 'Comprueba el enlace de devolución en los datos de la compra.'); }
  };

  const finishReturn = (outcome: 'in_progress' | 'refunded') => {
    const title = outcome === 'refunded' ? '¿Confirmas que recibiste el reembolso?' : '¿Ya enviaste o entregaste el artículo?';
    const body = outcome === 'refunded' ? 'La compra se guardará en el historial como reembolsada.' : 'La compra pasará al historial para que puedas seguir el reembolso.';
    Alert.alert(title, body, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: async () => { setBusy(true); await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); markReturned(item.id, outcome); router.back(); setBusy(false); } },
    ]);
  };

  const deleteItem = () => Alert.alert('Eliminar compra', 'Se eliminará de tu lista y no aparecerá en el historial.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: () => { removeReturn(item.id); router.back(); } },
  ]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingTop: insets.top + 4, paddingBottom: insets.bottom + 35 }}>
        <View style={styles.navbar}>
          <Pressable onPress={() => router.back()} style={[styles.navButton, { backgroundColor: colors.card }]} accessibilityLabel="Volver"><Feather name="chevron-left" size={23} color={colors.foreground} /></Pressable>
          <Text style={[styles.navTitle, { color: colors.foreground }]}>Detalle de compra</Text>
          <Pressable onPress={() => router.push({ pathname: '/upload', params: { edit: item.id } })} style={[styles.navButton, { backgroundColor: colors.card }]} accessibilityLabel="Editar compra"><Feather name="edit-3" size={17} color={colors.foreground} /></Pressable>
        </View>
        <View style={styles.content}>
          <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.heroTop}><View style={[styles.storeMark, { backgroundColor: item.accent }]}><Text style={styles.storeInitial}>{item.initials}</Text></View><View style={styles.heroCopy}><Text style={[styles.itemTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.itemStore, { color: colors.mutedForeground }]}>{item.store}</Text></View></View>
            <View style={[styles.priceRow, { borderTopColor: colors.border }]}><Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>Importe de la compra</Text><Text style={[styles.price, { color: colors.foreground }]}>{formatPrice(item.price)}</Text></View>
          </View>

          <View style={[styles.deadlineCard, { backgroundColor: urgent ? colors.urgentSoft : colors.accent }]}>
            <View style={[styles.deadlineIcon, { backgroundColor: colors.card }]}><Feather name="clock" size={18} color={tone} /></View>
            <View style={styles.deadlineCopy}><Text style={[styles.deadlineEyebrow, { color: colors.mutedForeground }]}>FECHA LÍMITE INDICADA</Text><Text style={[styles.deadlineDate, { color: colors.foreground }]}>{formatDate(item.deadline)}</Text><Text style={[styles.deadlineHint, { color: tone }]}>{dueCopy}</Text></View>
            <View style={styles.countdown}><Text style={[styles.countdownNumber, { color: tone }]}>{days < 0 ? '!' : days}</Text><Text style={[styles.countdownLabel, { color: colors.mutedForeground }]}>{days < 0 ? 'pasó' : days === 1 ? 'día' : 'días'}</Text></View>
          </View>
          <View style={[styles.sourceNote, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="info" size={14} color={colors.mutedForeground} /><Text style={[styles.sourceText, { color: colors.mutedForeground }]}>Fecha guardada por ti. Confirma las condiciones exactas en tu pedido o con la tienda.</Text></View>

          <View style={styles.datesRow}><DateCell label="Comprado" value={formatDate(item.purchaseDate)} colors={colors} /><View style={[styles.dateDivider, { backgroundColor: colors.border }]} /><DateCell label="Fecha límite" value={formatDate(item.deadline)} colors={colors} /></View>

          <Text style={[styles.sectionHeading, { color: colors.foreground }]}>¿Qué quieres conseguir?</Text>
          <View style={styles.optionsRow}>{['Reembolso', 'Vale', 'Cambio'].map((label) => { const selected = item.returnOption === label; return <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { setReturnOption(item.id, selected ? undefined : label); Haptics.selectionAsync(); }} style={[styles.optionChip, { backgroundColor: selected ? colors.accent : colors.card, borderColor: selected ? colors.primary : colors.border }]}><Feather name={selected ? 'check-circle' : label === 'Reembolso' ? 'credit-card' : label === 'Vale' ? 'gift' : 'refresh-cw'} size={15} color={selected ? colors.primary : colors.mutedForeground} /><Text style={[styles.optionText, { color: selected ? colors.primary : colors.foreground }]}>{label}</Text></Pressable>; })}</View>

          <Pressable onPress={openReturns} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed || busy ? 0.84 : 1 }]}><Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{item.returnsUrl ? 'Abrir enlace de devolución' : 'Añadir enlace de devolución'}</Text><Feather name="external-link" size={16} color={colors.primaryForeground} /></Pressable>
          <Pressable onPress={() => finishReturn('in_progress')} style={[styles.secondaryButton, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="package" size={16} color={colors.foreground} /><Text style={[styles.secondaryText, { color: colors.foreground }]}>Ya inicié la devolución</Text></Pressable>
          <Pressable onPress={() => finishReturn('refunded')} style={styles.refundButton}><Feather name="check-circle" size={15} color={colors.success} /><Text style={[styles.refundText, { color: colors.success }]}>Ya recibí el reembolso</Text></Pressable>
          <Pressable onPress={deleteItem} style={styles.deleteButton}><Text style={[styles.deleteText, { color: colors.mutedForeground }]}>Eliminar compra</Text></Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function DateCell({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useApp>['colors'] }) {
  return <View style={styles.dateCell}><Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>{label}</Text><Text style={[styles.dateValue, { color: colors.foreground }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  missingTitle: { fontSize: 20, fontWeight: '700' },
  missingCopy: { fontSize: 14, marginTop: 7 },
  backLink: { marginTop: 20, padding: 12 },
  navbar: { height: 54, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 15, fontWeight: '600' },
  content: { paddingHorizontal: 22, paddingTop: 10 },
  heroCard: { borderRadius: 22, borderWidth: 1, padding: 17 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  storeMark: { width: 47, height: 47, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  storeInitial: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  heroCopy: { flex: 1, gap: 4 },
  itemTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  itemStore: { fontSize: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, marginTop: 16, paddingTop: 14 },
  priceLabel: { fontSize: 12 },
  price: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  deadlineCard: { minHeight: 112, borderRadius: 21, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  deadlineIcon: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  deadlineCopy: { flex: 1, gap: 4 },
  deadlineEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  deadlineDate: { fontSize: 17, fontWeight: '700' },
  deadlineHint: { fontSize: 12, fontWeight: '600' },
  countdown: { minWidth: 44, alignItems: 'center' },
  countdownNumber: { fontSize: 27, fontWeight: '700', fontVariant: ['tabular-nums'] },
  countdownLabel: { fontSize: 9, fontWeight: '600' },
  sourceNote: { borderRadius: 13, borderWidth: 1, padding: 11, flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 9 },
  sourceText: { flex: 1, fontSize: 11, lineHeight: 16 },
  datesRow: { flexDirection: 'row', alignItems: 'center', marginTop: 19, marginBottom: 25 },
  dateCell: { flex: 1, gap: 5 },
  dateDivider: { width: 1, height: 30, marginHorizontal: 14 },
  dateLabel: { fontSize: 11 },
  dateValue: { fontSize: 13, fontWeight: '600' },
  sectionHeading: { fontSize: 17, fontWeight: '700', marginBottom: 11 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  optionChip: { minHeight: 39, borderRadius: 13, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 7 },
  optionText: { fontSize: 12, fontWeight: '600' },
  primaryButton: { minHeight: 51, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryButtonText: { fontSize: 14, fontWeight: '700' },
  secondaryButton: { minHeight: 49, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 9 },
  secondaryText: { fontSize: 13, fontWeight: '600' },
  refundButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 5 },
  refundText: { fontSize: 12, fontWeight: '600' },
  deleteButton: { alignItems: 'center', paddingVertical: 9 },
  deleteText: { fontSize: 11, fontWeight: '500' },
});

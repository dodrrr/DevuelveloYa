import React, { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';

function formatPrice(price: number) { return price.toFixed(2).replace('.', ',') + ' €'; }
function getTone(days: number, colors: ReturnType<typeof useApp>['colors']) {
  if (days <= 2) return { color: colors.destructive, soft: colors.urgentSoft };
  if (days <= 10) return { color: colors.warning, soft: colors.warningSoft };
  return { color: colors.success, soft: colors.successSoft };
}

export default function DetailScreen() {
  const { colors, returns, markReturned } = useApp();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = returns.find((entry) => entry.id === id);
  const [option, setOption] = useState<string | null>(null);
  if (!item) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.foreground }}>Esta devolución ya no está activa.</Text><Pressable onPress={() => router.back()}><Text style={{ color: colors.primary, marginTop: 12 }}>Volver</Text></Pressable></View>;
  const tone = getTone(item.daysLeft, colors);
  const progress = Math.max(0.08, Math.min(1, item.daysLeft / item.totalDays));
  const ringSize = 202;
  const radius = 82;
  const circumference = 2 * Math.PI * radius;

  const confirmReturned = () => {
    Alert.alert('¿Marcar como devuelto?', 'La compra desaparecerá de tus devoluciones activas.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Marcar como devuelto', onPress: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); markReturned(item.id); router.back(); } },
    ]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 30 }}>
        <View style={styles.navbar}>
          <Pressable onPress={() => router.back()} style={styles.navButton} accessibilityLabel="Volver"><Feather name="chevron-left" size={26} color={colors.foreground} /></Pressable>
          <Text numberOfLines={1} style={[styles.navTitle, { color: colors.foreground }]}>{item.title}</Text>
          <Pressable onPress={() => Alert.alert('Opciones', 'Puedes editar los datos o eliminar esta devolución.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => { markReturned(item.id); router.back(); } }])} style={styles.navButton} accessibilityLabel="Más opciones"><Feather name="more-horizontal" size={24} color={colors.foreground} /></Pressable>
        </View>
        <View style={styles.content}>
          <View style={[styles.heroCard, { backgroundColor: colors.card }]}>
            <View style={styles.heroTop}>
              <View style={[styles.storeMark, { backgroundColor: item.accent }]}><Text style={styles.storeInitial}>{item.initials}</Text></View>
              <View style={styles.heroCopy}><Text style={[styles.itemTitle, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.itemStore, { color: colors.mutedForeground }]}>{item.store}</Text></View>
              <Text style={[styles.price, { color: colors.foreground }]}>{formatPrice(item.price)}</Text>
            </View>
            <View style={[styles.metaGrid, { borderTopColor: colors.border }]}>
              <View><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Comprado el</Text><Text style={[styles.metaValue, { color: colors.foreground }]}>{item.purchaseDate}</Text></View>
              <View><Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Devolver antes del</Text><Text style={[styles.metaValue, { color: tone.color }]}>{item.deadline}</Text></View>
            </View>
          </View>

          <View style={[styles.countdownCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TIEMPO RESTANTE</Text>
            <View style={styles.ringWrap}>
              <Svg width={ringSize} height={ringSize} viewBox="0 0 202 202">
                <Circle cx="101" cy="101" r={radius} stroke={colors.muted} strokeWidth="14" fill="none" />
                <Circle cx="101" cy="101" r={radius} stroke={tone.color} strokeWidth="14" fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} transform="rotate(-90 101 101)" />
              </Svg>
              <View style={styles.ringCenter}><Text style={[styles.ringNumber, { color: tone.color }]}>{item.daysLeft}</Text><Text style={[styles.ringDays, { color: colors.mutedForeground }]}>{item.daysLeft === 1 ? 'día' : 'días'}</Text></View>
            </View>
            <View style={[styles.deadlinePill, { backgroundColor: tone.soft }]}><View style={[styles.dot, { backgroundColor: tone.color }]} /><Text style={[styles.deadlineText, { color: tone.color }]}>{item.daysLeft <= 2 ? 'Últimos días para devolverlo' : 'Todavía tienes tiempo'}</Text></View>
          </View>

          <Text style={[styles.sectionHeading, { color: colors.foreground }]}>Opciones de devolución</Text>
          <View style={styles.optionsRow}>
            {['Reembolso', 'Vale', 'Cambio de talla'].map((label) => { const selected = option === label; return <Pressable key={label} onPress={() => { setOption(selected ? null : label); Haptics.selectionAsync(); }} style={[styles.optionChip, { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border }]}><Feather name={selected ? 'check' : 'circle'} size={14} color={selected ? colors.primaryForeground : colors.mutedForeground} /><Text style={{ color: selected ? colors.primaryForeground : colors.foreground, fontSize: 13, fontWeight: '500' }}>{label}</Text></Pressable>; })}
          </View>
          <Pressable onPress={() => Linking.openURL(item.returnsUrl)} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}><Text style={styles.primaryButtonText}>Ir a la web de devoluciones</Text><Feather name="external-link" size={17} color={colors.primaryForeground} /></Pressable>
          <Pressable onPress={confirmReturned} style={styles.returnedButton}><Feather name="check-circle" size={16} color={colors.destructive} /><Text style={[styles.returnedText, { color: colors.destructive }]}>Marcar como devuelto</Text></Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navbar: { height: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  content: { paddingHorizontal: 20 },
  heroCard: { borderRadius: 18, padding: 17, marginTop: 7, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  storeMark: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  storeInitial: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  heroCopy: { flex: 1 },
  itemTitle: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  itemStore: { fontSize: 13 },
  price: { fontSize: 16, fontWeight: '600' },
  metaGrid: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, marginTop: 17, paddingTop: 15 },
  metaLabel: { fontSize: 12, marginBottom: 5 },
  metaValue: { fontSize: 14, fontWeight: '500' },
  countdownCard: { borderRadius: 18, marginTop: 12, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  ringWrap: { width: 202, height: 202, alignItems: 'center', justifyContent: 'center', marginVertical: 15 },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringNumber: { fontSize: 48, fontWeight: '700', letterSpacing: -1 },
  ringDays: { fontSize: 14, marginTop: -2 },
  deadlinePill: { borderRadius: 100, paddingHorizontal: 13, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  deadlineText: { fontSize: 12, fontWeight: '600' },
  sectionHeading: { fontSize: 20, fontWeight: '600', marginTop: 28, marginBottom: 12 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: { borderRadius: 100, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  primaryButton: { height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginTop: 25 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  returnedButton: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingVertical: 19 },
  returnedText: { fontSize: 14, fontWeight: '600' },
});

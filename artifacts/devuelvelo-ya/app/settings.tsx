import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import type { Appearance } from '@/constants/colors';

export default function SettingsScreen() {
  const { colors, appearance, setAppearance, returns, history } = useApp();
  const insets = useSafeAreaInsets();
  const selectAppearance = (next: Appearance) => { setAppearance(next); Haptics.selectionAsync(); };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 35 }}>
        <View style={styles.header}><Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.card }]} accessibilityLabel="Volver"><Feather name="chevron-left" size={23} color={colors.foreground} /></Pressable><Text style={[styles.title, { color: colors.foreground }]}>Ajustes</Text><View style={{ width: 40 }} /></View>
        <View style={styles.content}>
          <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.heroIcon, { backgroundColor: colors.accent }]}><Feather name="settings" size={20} color={colors.primary} /></View><View style={styles.heroCopy}><Text style={[styles.heroTitle, { color: colors.foreground }]}>Tu espacio</Text><Text style={[styles.heroSubtitle, { color: colors.mutedForeground }]}>DevuélveloYa · versión beta</Text></View><View style={[styles.betaBadge, { backgroundColor: colors.warningSoft }]}><Text style={[styles.betaText, { color: colors.warning }]}>BETA</Text></View></View>

          <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>APARIENCIA</Text>
          <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionIntro}><View style={[styles.smallIcon, { backgroundColor: colors.accent }]}><Feather name="sun" size={15} color={colors.primary} /></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>Aspecto de la app</Text><Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>Sigue el sistema o elige un tema</Text></View></View>
            <View style={[styles.segmented, { backgroundColor: colors.secondary }]}>{([['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']] as [Appearance, string][]).map(([value, label]) => <Pressable key={value} onPress={() => selectAppearance(value)} accessibilityRole="button" accessibilityState={{ selected: appearance === value }} style={[styles.segment, appearance === value && { backgroundColor: colors.card }]}><Text style={[styles.segmentText, { color: appearance === value ? colors.foreground : colors.mutedForeground }]}>{label}</Text></Pressable>)}</View>
          </View>

          <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>TUS DATOS</Text>
          <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <InfoRow icon="smartphone" title="Guardado en este dispositivo" subtitle={`${returns.length} compras activas · ${history.length} en historial`} colors={colors} />
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <InfoRow icon="bell" title="Avisos automáticos" subtitle="La programación de notificaciones aún no está activa." colors={colors} />
          </View>
          <View style={[styles.privacyCard, { backgroundColor: colors.accent }]}><Feather name="lock" size={16} color={colors.primary} /><Text style={[styles.privacyText, { color: colors.foreground }]}>En esta versión beta, tus compras permanecen en este teléfono. Aún no hay cuenta, sincronización ni importación de emails.</Text></View>

          <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>ACERCA DE</Text>
          <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}><InfoRow icon="heart" title="Hecha para devoluciones más fáciles" subtitle="Estamos preparando las pruebas beta de DevuélveloYa." colors={colors} /></View>
          <Text style={[styles.version, { color: colors.mutedForeground }]}>DevuélveloYa · 1.1.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, title, subtitle, colors }: { icon: React.ComponentProps<typeof Feather>['name']; title: string; subtitle: string; colors: ReturnType<typeof useApp>['colors'] }) {
  return <View style={styles.infoRow}><View style={[styles.smallIcon, { backgroundColor: colors.secondary }]}><Feather name={icon} size={15} color={colors.mutedForeground} /></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 52, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700' },
  content: { paddingHorizontal: 22, paddingTop: 10 },
  hero: { minHeight: 76, borderRadius: 19, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, gap: 3 },
  heroTitle: { fontSize: 15, fontWeight: '700' },
  heroSubtitle: { fontSize: 11 },
  betaBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  betaText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  groupLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginLeft: 11, marginBottom: 8, marginTop: 23 },
  group: { borderRadius: 17, borderWidth: 1, overflow: 'hidden', padding: 12 },
  sectionIntro: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  smallIcon: { width: 31, height: 31, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 12, fontWeight: '600' },
  rowSubtitle: { fontSize: 10, lineHeight: 15 },
  segmented: { minHeight: 40, borderRadius: 12, padding: 3, flexDirection: 'row' },
  segment: { flex: 1, borderRadius: 9, minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 11, fontWeight: '600' },
  infoRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10 },
  separator: { height: 1, marginLeft: 41, marginVertical: 6 },
  privacyCard: { borderRadius: 15, paddingHorizontal: 13, paddingVertical: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 10 },
  privacyText: { flex: 1, fontSize: 11, lineHeight: 17 },
  version: { textAlign: 'center', fontSize: 10, marginTop: 25, marginBottom: 10 },
});

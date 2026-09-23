import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Appearance, useApp } from '@/context/AppContext';

export default function SettingsScreen() {
  const { colors, appearance, setAppearance, notificationsEnabled, setNotificationsEnabled, notificationDays, setNotificationDays } = useApp();
  const insets = useSafeAreaInsets();
  const [showDays, setShowDays] = useState(false);
  const [toast, setToast] = useState(false);
  const email = 'rodrigo.x7f2@devuelveloya.app';
  const copy = async () => { await Clipboard.setStringAsync(email); await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setToast(true); setTimeout(() => setToast(false), 1800); };
  const selectAppearance = (next: Appearance) => { setAppearance(next); Haptics.selectionAsync(); };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 }}>
        <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Volver"><Feather name="chevron-left" size={26} color={colors.foreground} /></Pressable><Text style={[styles.title, { color: colors.foreground }]}>Ajustes</Text><View style={{ width: 42 }} /></View>
        <View style={styles.content}>
          <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>CUENTA</Text>
          <View style={[styles.group, { backgroundColor: colors.card }]}>
            <SettingRow icon="mail" iconColor={colors.primary} iconBackground={colors.accent} title="Email de reenvío" subtitle={email} colors={colors} trailing={<Pressable onPress={copy} accessibilityLabel="Copiar email"><Feather name="copy" size={17} color={colors.primary} /></Pressable>} />
            <SettingRow icon="credit-card" iconColor="#7B61FF" iconBackground={colors.accent} title="Plan actual" subtitle="Plan gratuito" colors={colors} trailing={<Feather name="chevron-right" size={18} color={colors.mutedForeground} />} last />
          </View>

          <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>NOTIFICACIONES</Text>
          <View style={[styles.group, { backgroundColor: colors.card }]}>
            <SettingRow icon="bell" iconColor={colors.warning} iconBackground={colors.warningSoft} title="Avisarme antes de que caduque" subtitle="Recibe un recordatorio a tiempo" colors={colors} trailing={<Switch value={notificationsEnabled} onValueChange={(value) => { setNotificationsEnabled(value); Haptics.selectionAsync(); }} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" /> } />
            <Pressable onPress={() => setShowDays((value) => !value)} style={styles.preferenceRow}>
              <View style={[styles.smallIcon, { backgroundColor: colors.successSoft }]}><Feather name="calendar" size={16} color={colors.success} /></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>Avisar con antelación</Text><Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>{notificationDays} días antes</Text></View><Feather name={showDays ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
            </Pressable>
            {showDays ? <View style={[styles.daysPicker, { borderTopColor: colors.border }]}>{[3, 5, 7].map((days) => <Pressable key={days} onPress={() => { setNotificationDays(days); setShowDays(false); Haptics.selectionAsync(); }} style={[styles.dayOption, { backgroundColor: notificationDays === days ? colors.accent : 'transparent' }]}><Text style={[styles.dayText, { color: notificationDays === days ? colors.primary : colors.foreground }]}>{days} días antes</Text>{notificationDays === days ? <Feather name="check" size={16} color={colors.primary} /> : null}</Pressable>)}</View> : null}
          </View>

          <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>APARIENCIA</Text>
          <View style={[styles.group, { backgroundColor: colors.card, padding: 6 }]}>
            <View style={[styles.segmented, { backgroundColor: colors.secondary }]}>{([['system', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']] as [Appearance, string][]).map(([value, label]) => <Pressable key={value} onPress={() => selectAppearance(value)} style={[styles.segment, appearance === value && { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 }]}><Text style={[styles.segmentText, { color: appearance === value ? colors.foreground : colors.mutedForeground }]}>{label}</Text></Pressable>)}</View>
          </View>

          <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>SUSCRIPCIÓN</Text>
          <View style={[styles.group, { backgroundColor: colors.card }]}><SettingRow icon="star" iconColor="#FFB800" iconBackground={colors.warningSoft} title="Plan gratuito" subtitle="3 devoluciones activas" colors={colors} trailing={<Feather name="chevron-right" size={18} color={colors.mutedForeground} />} last /></View>

          <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>SOPORTE</Text>
          <View style={[styles.group, { backgroundColor: colors.card }]}>
            <SettingRow icon="help-circle" iconColor={colors.primary} iconBackground={colors.accent} title="Ayuda" colors={colors} trailing={<Feather name="chevron-right" size={18} color={colors.mutedForeground} />} />
            <SettingRow icon="message-circle" iconColor={colors.success} iconBackground={colors.successSoft} title="Escríbenos" colors={colors} trailing={<Feather name="chevron-right" size={18} color={colors.mutedForeground} />} />
            <SettingRow icon="shield" iconColor={colors.mutedForeground} iconBackground={colors.secondary} title="Política de privacidad" colors={colors} trailing={<Feather name="chevron-right" size={18} color={colors.mutedForeground} />} last />
          </View>
          <Text style={[styles.version, { color: colors.mutedForeground }]}>DevuélveloYa · versión 1.0</Text>
        </View>
      </ScrollView>
      {toast ? <View style={[styles.toast, { backgroundColor: colors.foreground }]}><Feather name="check" size={15} color={colors.background} /><Text style={[styles.toastText, { color: colors.background }]}>Copiado</Text></View> : null}
    </View>
  );
}

function SettingRow({ icon, iconColor, iconBackground, title, subtitle, trailing, colors, last }: { icon: React.ComponentProps<typeof Feather>['name']; iconColor: string; iconBackground: string; title: string; subtitle?: string; trailing: React.ReactNode; colors: ReturnType<typeof useApp>['colors']; last?: boolean }) {
  return <View style={[styles.settingRow, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}><View style={[styles.smallIcon, { backgroundColor: iconBackground }]}><Feather name={icon} size={16} color={iconColor} /></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text>{subtitle ? <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>{subtitle}</Text> : null}</View>{trailing}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  groupLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1, marginLeft: 14, marginBottom: 8, marginTop: 19 },
  group: { borderRadius: 16, overflow: 'hidden' },
  settingRow: { minHeight: 67, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center' },
  preferenceRow: { minHeight: 67, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center' },
  smallIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  rowCopy: { flex: 1, marginRight: 10 },
  rowTitle: { fontSize: 15, fontWeight: '500' },
  rowSubtitle: { fontSize: 12, marginTop: 3 },
  daysPicker: { borderTopWidth: 1, padding: 7 },
  dayOption: { minHeight: 39, borderRadius: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayText: { fontSize: 14, fontWeight: '500' },
  segmented: { minHeight: 40, borderRadius: 11, padding: 3, flexDirection: 'row' },
  segment: { flex: 1, borderRadius: 9, minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 12, fontWeight: '600' },
  version: { textAlign: 'center', fontSize: 12, marginTop: 25, marginBottom: 10 },
  toast: { position: 'absolute', bottom: 34, alignSelf: 'center', borderRadius: 100, paddingHorizontal: 15, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 7 },
  toastText: { fontSize: 13, fontWeight: '600' },
});

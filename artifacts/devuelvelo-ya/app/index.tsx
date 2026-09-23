import React, { useMemo, useRef, useState } from 'react';
import { Alert, Animated, FlatList, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReturnItem, useApp } from '@/context/AppContext';

function urgency(item: ReturnItem, palette: ReturnType<typeof useApp>['colors']) {
  if (item.daysLeft <= 2) return { color: palette.destructive, soft: palette.urgentSoft };
  if (item.daysLeft <= 10) return { color: palette.warning, soft: palette.warningSoft };
  return { color: palette.success, soft: palette.successSoft };
}

function ReturnCard({ item, onDelete }: { item: ReturnItem; onDelete: () => void }) {
  const { colors } = useApp();
  const [swiped, setSwiped] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const tone = urgency(item, colors);
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8,
    onPanResponderMove: (_, gesture) => {
      if (gesture.dx < 0) translateX.setValue(Math.max(gesture.dx, -92));
    },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx < -55) {
        setSwiped(true);
        Animated.spring(translateX, { toValue: -92, useNativeDriver: true }).start();
        Haptics.selectionAsync();
      } else {
        setSwiped(false);
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  })).current;

  const askDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('¿Eliminar esta devolución?', 'Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <View style={styles.swipeWrap}>
      <View style={[styles.deleteAction, { backgroundColor: colors.destructive }]}>
        <Pressable onPress={askDelete} style={styles.deleteActionButton} accessibilityLabel={'Eliminar ' + item.title}>
          <Feather name="trash-2" size={18} color={colors.destructiveForeground} />
          <Text style={styles.deleteActionText}>Eliminar</Text>
        </Pressable>
      </View>
      <Animated.View style={[styles.cardShadow, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        <Pressable
          onPress={() => router.push({ pathname: '/detail', params: { id: item.id } })}
          onLongPress={() => setSwiped(true)}
          style={[styles.returnCard, { backgroundColor: colors.card }]}
          accessibilityRole="button"
          accessibilityLabel={'Ver detalles de ' + item.title}
        >
          <View style={[styles.storeMark, { backgroundColor: item.accent }]}>
            <Text style={styles.storeInitial}>{item.initials}</Text>
          </View>
          <View style={styles.cardCopy}>
            <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.foreground }]}>{item.title}</Text>
            <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]}>{item.store} · {formatPrice(item.price)}</Text>
          </View>
          <View style={[styles.daysBadge, { backgroundColor: tone.soft }]}>
            <Text style={[styles.daysNumber, { color: tone.color }]}>{item.daysLeft}</Text>
            <Text style={[styles.daysLabel, { color: tone.color }]}>{item.daysLeft === 1 ? 'día' : 'días'}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function formatPrice(price: number) {
  return price.toFixed(2).replace('.', ',') + ' €';
}

export default function HomeScreen() {
  const { colors, returns, removeReturn } = useApp();
  const insets = useSafeAreaInsets();
  const sortedReturns = useMemo(() => [...returns].sort((a, b) => a.daysLeft - b.daysLeft), [returns]);
  const urgentCount = sortedReturns.filter((item) => item.daysLeft <= 2).length;

  const openUpload = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/upload');
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={sortedReturns}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ReturnCard item={item} onDelete={() => removeReturn(item.id)} />}
        showsVerticalScrollIndicator={false}
        scrollEnabled={sortedReturns.length > 0}
        contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 120 }]}
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <View>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>DEVUÉLVELOYA</Text>
                <Text style={[styles.screenTitle, { color: colors.foreground }]}>Tus devoluciones</Text>
              </View>
              <Pressable onPress={() => router.push('/settings')} style={[styles.iconButton, { backgroundColor: colors.card }]} accessibilityLabel="Abrir ajustes">
                <Feather name="settings" size={21} color={colors.foreground} />
              </Pressable>
            </View>
            {sortedReturns.length > 0 ? (
              <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.summaryIcon, { backgroundColor: colors.accent }]}><Feather name="clock" size={16} color={colors.primary} /></View>
                <View style={styles.summaryCopy}>
                  <Text style={[styles.summaryTitle, { color: colors.foreground }]}>{sortedReturns.length} activas</Text>
                  <Text style={[styles.summaryText, { color: colors.mutedForeground }]}>{urgentCount > 0 ? urgentCount + ' necesita' + (urgentCount === 1 ? '' : 'n') + ' tu atención' : 'Todo bajo control'}</Text>
                </View>
                <Feather name="arrow-up-right" size={18} color={colors.mutedForeground} />
              </View>
            ) : null}
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Próximas a vencer</Text>
              {sortedReturns.length > 0 ? <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>{sortedReturns.length} compras</Text> : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.accent }]}><Feather name="inbox" size={30} color={colors.primary} /></View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aún no tienes devoluciones activas</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Reenvía una confirmación de compra y aparecerá aquí automáticamente.</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
      <BlurView intensity={Platform.OS === 'ios' ? 85 : 0} tint={colors.background === '#000000' ? 'dark' : 'light'} style={[styles.footer, { paddingBottom: insets.bottom + 10, backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background }]}>
        <Pressable onPress={openUpload} style={({ pressed }) => [styles.uploadButton, { backgroundColor: colors.primary, opacity: pressed ? 0.86 : 1 }]} accessibilityRole="button" accessibilityLabel="Subir compra">
          <Feather name="plus" size={21} color={colors.primaryForeground} strokeWidth={1.8} />
          <Text style={styles.uploadButtonText}>Subir compra</Text>
        </Pressable>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 7 },
  screenTitle: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  summaryCard: { minHeight: 70, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 28 },
  summaryIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  summaryCopy: { flex: 1 },
  summaryTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  summaryText: { fontSize: 13 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '600', letterSpacing: -0.2 },
  sectionMeta: { fontSize: 13 },
  swipeWrap: { position: 'relative', borderRadius: 16, overflow: 'hidden' },
  cardShadow: { borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  returnCard: { minHeight: 84, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' },
  storeMark: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  storeInitial: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  cardCopy: { flex: 1, minWidth: 0, marginRight: 9 },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  cardSubtitle: { fontSize: 13 },
  daysBadge: { minWidth: 53, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, marginRight: 8 },
  daysNumber: { fontSize: 22, fontWeight: '700', lineHeight: 24 },
  daysLabel: { fontSize: 10, fontWeight: '500', marginTop: 1 },
  deleteAction: { ...StyleSheet.absoluteFillObject, alignItems: 'flex-end', justifyContent: 'center' },
  deleteActionButton: { width: 92, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 4 },
  deleteActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12 },
  uploadButton: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, shadowColor: '#2D5BFF', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  uploadButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingHorizontal: 25, paddingVertical: 65 },
  emptyIcon: { width: 74, height: 74, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  emptyText: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
});

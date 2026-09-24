import { MotionPressable as Pressable } from "@/components/motion-pressable";
import React, { useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReturnItem, daysLeftFor, useApp } from "@/context/AppContext";
import { formatDate, urgencyLabel } from "@/utils/return-dates";

function formatPrice(price: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(price);
}

function toneFor(days: number, colors: ReturnType<typeof useApp>["colors"]) {
  if (days <= 2) return { color: colors.destructive, soft: colors.urgentSoft };
  if (days <= 7) return { color: colors.warning, soft: colors.warningSoft };
  return { color: colors.success, soft: colors.successSoft };
}

function ReturnCard({ item }: { item: ReturnItem }) {
  const { colors } = useApp();
  const days = daysLeftFor(item);
  const tone = toneFor(days, colors);
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/detail", params: { id: item.id } })
      }
      style={({ pressed }) => [
        styles.returnCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.82 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.store}, ${urgencyLabel(days)}`}
    >
      <View style={[styles.storeMark, { backgroundColor: item.accent }]}>
        <Text style={styles.storeInitial}>{item.initials}</Text>
      </View>
      <View style={styles.cardCopy}>
        <Text
          numberOfLines={1}
          style={[styles.cardTitle, { color: colors.foreground }]}
        >
          {item.title}
        </Text>
        <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]}>
          {item.store} · {formatPrice(item.price)}
        </Text>
      </View>
      <View style={styles.cardRight}>
        <View style={[styles.daysBadge, { backgroundColor: tone.soft }]}>
          <Text style={[styles.daysNumber, { color: tone.color }]}>
            {days < 0 ? "!" : days}
          </Text>
        </View>
        <Text
          style={[styles.cardDate, { color: tone.color }]}
          numberOfLines={1}
        >
          {days < 0
            ? "Vencida"
            : formatDate(item.deadline, { day: "numeric", month: "short" })}
        </Text>
      </View>
      <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function HomeScreen({
  onNavigate,
}: {
  onNavigate: (tab: number) => void;
}) {
  const { colors, returns, hydrated } = useApp();
  const insets = useSafeAreaInsets();
  const sortedReturns = useMemo(
    () => [...returns].sort((a, b) => daysLeftFor(a) - daysLeftFor(b)),
    [returns],
  );
  const urgentCount = sortedReturns.filter(
    (item) => daysLeftFor(item) <= 2,
  ).length;
  const totalValue = sortedReturns.reduce((sum, item) => sum + item.price, 0);
  const next = sortedReturns[0];
  const nextDays = next ? daysLeftFor(next) : 0;

  const openUpload = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/upload");
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={sortedReturns}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ReturnCard item={item} />}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 176 },
        ]}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={
          <View>
            <View style={styles.topLine}>
              <View style={styles.brand}>
                <View
                  style={[
                    styles.brandIcon,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Feather
                    name="package"
                    size={14}
                    color={colors.primaryForeground}
                  />
                </View>
                <Text
                  style={[styles.eyebrow, { color: colors.mutedForeground }]}
                >
                  DEVUÉLVELOYA
                </Text>
              </View>
              <Pressable
                onPress={() => onNavigate(2)}
                style={({ pressed }) => [
                  styles.profileButton,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                accessibilityLabel="Abrir ajustes"
              >
                <Feather name="settings" size={19} color={colors.foreground} />
              </Pressable>
            </View>
            <Text style={[styles.screenTitle, { color: colors.foreground }]}>
              Tus compras
            </Text>
            <Text
              style={[styles.screenSubtitle, { color: colors.mutedForeground }]}
            >
              Todo a tiempo. Sin darle más vueltas.
            </Text>
            {sortedReturns.length ? (
              <View
                style={[styles.moneyCard, { backgroundColor: colors.primary }]}
              >
                <View style={styles.moneyTop}>
                  <Text
                    style={[
                      styles.moneyLabel,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    VALOR DE TUS COMPRAS
                  </Text>
                  <View style={styles.moneyIcon}>
                    <Feather
                      name="shield"
                      size={17}
                      color={colors.primaryForeground}
                    />
                  </View>
                </View>
                <Text
                  style={[
                    styles.moneyAmount,
                    { color: colors.primaryForeground },
                  ]}
                >
                  {formatPrice(totalValue)}
                </Text>
                <View style={styles.moneyBottom}>
                  <Text
                    style={[
                      styles.moneyNote,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    {sortedReturns.length}{" "}
                    {sortedReturns.length === 1
                      ? "compra activa"
                      : "compras activas"}
                  </Text>
                  {urgentCount > 0 ? (
                    <View style={styles.urgentPill}>
                      <View style={styles.whiteDot} />
                      <Text
                        style={[
                          styles.urgentPillText,
                          { color: colors.primaryForeground },
                        ]}
                      >
                        {urgentCount} urgente{urgentCount === 1 ? "" : "s"}
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={[
                        styles.moneyNote,
                        { color: colors.primaryForeground },
                      ]}
                    >
                      Todo bajo control
                    </Text>
                  )}
                </View>
              </View>
            ) : null}
            {next ? (
              <Pressable
                onPress={() =>
                  router.push({ pathname: "/detail", params: { id: next.id } })
                }
                style={({ pressed }) => [
                  styles.nextCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.86 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.nextAccent,
                    { backgroundColor: toneFor(nextDays, colors).color },
                  ]}
                />
                <View style={styles.nextCopy}>
                  <Text
                    style={[
                      styles.nextEyebrow,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    SIGUIENTE EN VENCER
                  </Text>
                  <Text
                    style={[styles.nextTitle, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {next.title}
                  </Text>
                  <Text
                    style={[
                      styles.nextText,
                      { color: toneFor(nextDays, colors).color },
                    ]}
                  >
                    {urgencyLabel(nextDays)}
                  </Text>
                </View>
                <Feather
                  name="arrow-up-right"
                  size={19}
                  color={colors.mutedForeground}
                />
              </Pressable>
            ) : null}
            <View style={styles.sectionRow}>
              <View>
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}
                >
                  Devoluciones
                </Text>
                <Text
                  style={[
                    styles.sectionSubtitle,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {sortedReturns.length
                    ? "Ordenadas por fecha límite"
                    : "Añade una compra para empezar"}
                </Text>
              </View>
              <Pressable
                onPress={openUpload}
                style={({ pressed }) => [
                  styles.addSmall,
                  {
                    backgroundColor: colors.accent,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                accessibilityLabel="Añadir compra"
              >
                <Feather name="plus" size={20} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          hydrated ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View
                style={[styles.emptyIcon, { backgroundColor: colors.accent }]}
              >
                <Feather name="inbox" size={25} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                Tu lista empieza aquí
              </Text>
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}
              >
                Guarda una compra y te ayudaremos a tener presente su fecha
                límite.
              </Text>
              <Pressable
                onPress={openUpload}
                style={({ pressed }) => [
                  styles.emptyAction,
                  {
                    backgroundColor: colors.primary,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Feather
                  name="plus"
                  size={17}
                  color={colors.primaryForeground}
                />
                <Text
                  style={[
                    styles.emptyActionText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Añadir primera compra
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text
              style={[styles.loadingText, { color: colors.mutedForeground }]}
            >
              Preparando tus compras…
            </Text>
          )
        }
      />
      <View
        style={[styles.fixedActions, { paddingBottom: insets.bottom + 96 }]}
      >
        <Pressable
          onPress={openUpload}
          style={({ pressed }) => [
            styles.uploadButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.99 : 1 }],
            },
          ]}
          accessibilityRole="button"
        >
          <Feather name="plus" size={19} color={colors.primaryForeground} />
          <Text
            style={[
              styles.uploadButtonText,
              { color: colors.primaryForeground },
            ]}
          >
            Añadir compra
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { paddingHorizontal: 22, flexGrow: 1 },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  brand: { flexDirection: "row", gap: 9, alignItems: "center" },
  brandIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: { fontSize: 13, fontWeight: "700", letterSpacing: 1.25 },
  profileButton: {
    width: 42,
    height: 42,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  screenTitle: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1.2,
    lineHeight: 40,
  },
  screenSubtitle: { fontSize: 15, marginTop: 3, marginBottom: 22 },
  moneyCard: { borderRadius: 24, padding: 20, marginBottom: 12 },
  moneyTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  moneyLabel: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  moneyIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  moneyAmount: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -0.8,
    marginTop: 10,
    fontVariant: ["tabular-nums"],
  },
  moneyBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  moneyNote: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 14,
    fontWeight: "500",
  },
  urgentPill: {
    backgroundColor: "rgba(255,255,255,0.17)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  whiteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },
  urgentPillText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  nextCard: {
    minHeight: 82,
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 27,
  },
  nextAccent: { width: 4, alignSelf: "stretch", borderRadius: 4 },
  nextCopy: { flex: 1, gap: 3 },
  nextEyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  nextTitle: { fontSize: 15, fontWeight: "600" },
  nextText: { fontSize: 14, fontWeight: "600" },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 21, fontWeight: "700", letterSpacing: -0.4 },
  sectionSubtitle: { fontSize: 14, marginTop: 3 },
  addSmall: {
    width: 36,
    height: 36,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  returnCard: {
    minHeight: 76,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  storeMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  storeInitial: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  cardCopy: { flex: 1, minWidth: 0, gap: 4 },
  cardTitle: { fontSize: 14, fontWeight: "600" },
  cardSubtitle: { fontSize: 13 },
  cardRight: { alignItems: "center", gap: 4, minWidth: 44 },
  daysBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  daysNumber: {
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  cardDate: { fontSize: 11, fontWeight: "600" },
  emptyCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    marginTop: 2,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 7 },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 270,
  },
  emptyAction: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
  },
  emptyActionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  loadingText: { paddingVertical: 35, textAlign: "center", fontSize: 13 },
  fixedActions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
  },
  uploadButton: {
    height: 52,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  uploadButtonText: { fontSize: 15, fontWeight: "600" },
  bottomNav: {
    minHeight: 60,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 9,
  },
  navItem: {
    minWidth: 78,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
  },
  navLabel: { fontSize: 12, fontWeight: "600" },
});

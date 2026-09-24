import { MotionPressable as Pressable } from "@/components/motion-pressable";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import type { Appearance } from "@/constants/colors";

export default function SettingsScreen() {
  const { colors, appearance, setAppearance, returns, history } = useApp();
  const insets = useSafeAreaInsets();
  const selectAppearance = (next: Appearance) => {
    setAppearance(next);
    Haptics.selectionAsync();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 130,
        }}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Ajustes
          </Text>
        </View>
        <View style={styles.content}>
          <View
            style={[
              styles.hero,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={[styles.heroIcon, { backgroundColor: colors.accent }]}>
              <Feather name="settings" size={20} color={colors.primary} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroTitle, { color: colors.foreground }]}>
                A tu manera
              </Text>
              <Text
                style={[styles.heroSubtitle, { color: colors.mutedForeground }]}
              >
                DevuélveloYa · versión beta
              </Text>
            </View>
            <View
              style={[
                styles.betaBadge,
                { backgroundColor: colors.warningSoft },
              ]}
            >
              <Text style={[styles.betaText, { color: colors.warning }]}>
                BETA
              </Text>
            </View>
          </View>

          <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>
            APARIENCIA
          </Text>
          <View
            style={[
              styles.group,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.sectionIntro}>
              <View
                style={[styles.smallIcon, { backgroundColor: colors.accent }]}
              >
                <Feather name="sun" size={15} color={colors.primary} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>
                  Aspecto de la app
                </Text>
                <Text
                  style={[
                    styles.rowSubtitle,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Sigue el sistema o elige un tema
                </Text>
              </View>
            </View>
            <View
              style={[styles.segmented, { backgroundColor: colors.secondary }]}
            >
              {(
                [
                  ["system", "Sistema"],
                  ["light", "Claro"],
                  ["dark", "Oscuro"],
                ] as [Appearance, string][]
              ).map(([value, label]) => (
                <Pressable
                  key={value}
                  onPress={() => selectAppearance(value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: appearance === value }}
                  style={[
                    styles.segment,
                    appearance === value && { backgroundColor: colors.card },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      {
                        color:
                          appearance === value
                            ? colors.foreground
                            : colors.mutedForeground,
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>
            TUS DATOS
          </Text>
          <View
            style={[
              styles.group,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <InfoRow
              icon="smartphone"
              title="Guardado en este dispositivo"
              subtitle={`${returns.length} ${returns.length === 1 ? "compra activa" : "compras activas"} · ${history.length} en historial`}
              colors={colors}
            />
            <View
              style={[styles.separator, { backgroundColor: colors.border }]}
            />
            <InfoRow
              icon="bell"
              title="Avisos automáticos"
              subtitle="Próximamente. Por ahora, revisa los plazos en Compras."
              colors={colors}
            />
          </View>
          <View
            style={[styles.privacyCard, { backgroundColor: colors.accent }]}
          >
            <Feather name="lock" size={16} color={colors.primary} />
            <Text style={[styles.privacyText, { color: colors.foreground }]}>
              Tus compras se guardan solo en este teléfono. Si borras los datos
              de la app, se perderán. La sincronización llegará más adelante.
            </Text>
          </View>

          <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>
            ACERCA DE
          </Text>
          <View
            style={[
              styles.group,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <InfoRow
              icon="heart"
              title="Hecha para devoluciones más fáciles"
              subtitle="Estamos preparando las pruebas beta de DevuélveloYa."
              colors={colors}
            />
          </View>
          <Text style={[styles.version, { color: colors.mutedForeground }]}>
            DevuélveloYa · 1.2.0
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({
  icon,
  title,
  subtitle,
  colors,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  subtitle: string;
  colors: ReturnType<typeof useApp>["colors"];
}) {
  return (
    <View style={styles.infoRow}>
      <View style={[styles.smallIcon, { backgroundColor: colors.secondary }]}>
        <Feather name={icon} size={15} color={colors.mutedForeground} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>
          {title}
        </Text>
        <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    minHeight: 52,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 39,
    height: 39,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 34, fontWeight: "700", letterSpacing: -1 },
  content: { paddingHorizontal: 22, paddingTop: 10 },
  hero: {
    minHeight: 76,
    borderRadius: 24,
    borderWidth: 1,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: { flex: 1, gap: 3 },
  heroTitle: { fontSize: 15, fontWeight: "700" },
  heroSubtitle: { fontSize: 13 },
  betaBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  betaText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginLeft: 11,
    marginBottom: 8,
    marginTop: 23,
  },
  group: { borderRadius: 24, borderWidth: 1, overflow: "hidden", padding: 12 },
  sectionIntro: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  smallIcon: {
    width: 31,
    height: 31,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 14, fontWeight: "600" },
  rowSubtitle: { fontSize: 12, lineHeight: 21 },
  segmented: {
    minHeight: 40,
    borderRadius: 12,
    padding: 3,
    flexDirection: "row",
  },
  segment: {
    flex: 1,
    borderRadius: 9,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: { fontSize: 13, fontWeight: "600" },
  infoRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  separator: { height: 1, marginLeft: 41, marginVertical: 6 },
  privacyCard: {
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    marginTop: 10,
  },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 21 },
  version: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 25,
    marginBottom: 10,
  },
});

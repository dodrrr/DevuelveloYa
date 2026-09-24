import React from "react";
import { Platform, StyleSheet } from "react-native";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { useApp } from "@/context/AppContext";
import { useMotionPreferences } from "@/hooks/use-motion-preferences";

export function useLiquidGlass() {
  const { reducedTransparency } = useMotionPreferences();
  return (
    Platform.OS === "ios" &&
    !reducedTransparency &&
    isLiquidGlassAvailable() &&
    isGlassEffectAPIAvailable()
  );
}

export function LiquidGlassBackdrop({
  radius = 30,
  interactive = false,
}: {
  radius?: number;
  interactive?: boolean;
}) {
  const { appearance, systemScheme } = useApp();
  const available = useLiquidGlass();
  if (!available) return null;
  const colorScheme = appearance === "system" ? systemScheme : appearance;
  return (
    <GlassView
      pointerEvents="none"
      glassEffectStyle="regular"
      isInteractive={interactive}
      colorScheme={colorScheme}
      tintColor={colorScheme === "dark" ? "#493329" : "#F6E8DA"}
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: radius, borderCurve: "continuous" },
      ]}
    />
  );
}

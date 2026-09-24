import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { LiquidGlassBackdrop, useLiquidGlass } from "@/components/liquid-glass";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useMotionPreferences } from "@/hooks/use-motion-preferences";
import { MotionPressable } from "@/components/motion-pressable";
import Purchases from "@/screens/purchases";
import History from "@/screens/history";
import Settings from "@/screens/settings";

const tabs = [
  { label: "Compras", icon: "package" },
  { label: "Historial", icon: "archive" },
  { label: "Ajustes", icon: "sliders" },
] as const;

export default function HomePager() {
  const { colors, appearance, systemScheme } = useApp();
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { reducedMotion, reducedTransparency } = useMotionPreferences();
  const liquidGlass = useLiquidGlass();
  const pager = useRef<ScrollView>(null);
  const offset = useRef(new Animated.Value(0)).current;
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const [dockWidth, setDockWidth] = useState(0);
  const itemWidth = Math.max(0, (dockWidth - 12) / 3);
  const dockHeight = 62 + Math.max(0, fontScale - 1) * 20;
  const select = useCallback(
    (index: number, animate = true) => {
      const next = Math.max(0, Math.min(2, index));
      if (next !== activeRef.current)
        void Haptics.selectionAsync().catch(() => undefined);
      activeRef.current = next;
      setActive(next);
      pager.current?.scrollTo({
        x: next * width,
        animated: animate && !reducedMotion,
      });
    },
    [width, reducedMotion],
  );
  useEffect(() => {
    if (tab !== undefined)
      select(Number(tab) === 1 ? 1 : Number(tab) === 2 ? 2 : 0, false);
  }, [tab, select]);
  useEffect(() => {
    pager.current?.scrollTo({ x: activeRef.current * width, animated: false });
  }, [width]);
  const dockPan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dx) > 7 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_, gesture) => {
      if (!itemWidth) return;
      const fractional = Math.max(
        0,
        Math.min(2, activeRef.current + gesture.dx / itemWidth),
      );
      pager.current?.scrollTo({ x: fractional * width, animated: false });
    },
    onPanResponderRelease: (_, gesture) =>
      select(
        activeRef.current +
          Math.round((gesture.dx + gesture.vx * 70) / Math.max(itemWidth, 1)),
      ),
    onPanResponderTerminate: () => select(activeRef.current),
  });
  const dark = (appearance === "system" ? systemScheme : appearance) === "dark";
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Animated.ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        directionalLockEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: offset } } }],
          { useNativeDriver: true },
        )}
        onMomentumScrollEnd={(event) => {
          const next = Math.max(
            0,
            Math.min(2, Math.round(event.nativeEvent.contentOffset.x / width)),
          );
          if (next !== activeRef.current)
            void Haptics.selectionAsync().catch(() => undefined);
          activeRef.current = next;
          setActive(next);
        }}
        style={{ flex: 1 }}
      >
        {[
          <Purchases key="purchases" onNavigate={select} />,
          <History key="history" onNavigate={select} />,
          <Settings key="settings" />,
        ].map((screen, index) => (
          <View
            key={index}
            style={{ width, flex: 1 }}
            aria-hidden={active !== index}
            accessibilityElementsHidden={active !== index}
            importantForAccessibility={
              active === index ? "auto" : "no-hide-descendants"
            }
          >
            {screen}
          </View>
        ))}
      </Animated.ScrollView>
      <View style={[styles.dockOuter, { bottom: insets.bottom + 12 }]}>
        <View
          onLayout={(event) => setDockWidth(event.nativeEvent.layout.width)}
          style={[
            styles.dock,
            {
              height: dockHeight + 12,
              borderColor: colors.border,
              backgroundColor: liquidGlass
                ? "transparent"
                : reducedTransparency
                  ? colors.card
                  : dark
                    ? "rgba(36,30,25,0.92)"
                    : "rgba(255,253,250,0.9)",
            },
          ]}
          {...dockPan.panHandlers}
        >
          {liquidGlass ? (
            <LiquidGlassBackdrop radius={38} />
          ) : (
            !reducedTransparency && (
              <BlurView
                tint={dark ? "dark" : "light"}
                intensity={35}
                style={StyleSheet.absoluteFill}
              />
            )
          )}
          {itemWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 6,
                top: 6,
                width: itemWidth,
                height: dockHeight,
                borderRadius: 30,
                backgroundColor: liquidGlass ? "transparent" : colors.accent,
                transform: [
                  {
                    translateX: offset.interpolate({
                      inputRange: [0, width * 2],
                      outputRange: [0, itemWidth * 2],
                      extrapolate: "clamp",
                    }),
                  },
                ],
              }}
            >
              <LiquidGlassBackdrop radius={30} interactive />
            </Animated.View>
          )}
          {tabs.map((item, index) => (
            <MotionPressable
              key={item.label}
              onPress={() => select(index)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active === index }}
              accessibilityLabel={item.label}
              style={styles.tab}
            >
              <Feather
                name={item.icon}
                size={22}
                color={
                  active === index ? colors.primary : colors.mutedForeground
                }
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: active === index ? "700" : "500",
                  color:
                    active === index ? colors.primary : colors.mutedForeground,
                }}
              >
                {item.label}
              </Text>
            </MotionPressable>
          ))}
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  dockOuter: {
    position: "absolute",
    left: 20,
    right: 20,
    boxShadow: "0 6px 24px rgba(48,39,32,0.12)",
    borderRadius: 38,
  },
  dock: {
    borderRadius: 38,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 6,
    flexDirection: "row",
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 30,
  },
});

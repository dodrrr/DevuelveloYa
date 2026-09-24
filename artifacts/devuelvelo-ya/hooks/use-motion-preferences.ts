import React, { createContext, useContext, useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

const MotionContext = createContext({
  reducedMotion: true,
  reducedTransparency: true,
});
export function MotionPreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [reducedMotion, setReducedMotion] = useState(true);
  const [reducedTransparency, setReducedTransparency] = useState(true);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => active && setReducedMotion(value))
      .catch(() => undefined);
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    if (Platform.OS !== "ios")
      return () => {
        active = false;
        motion?.remove();
      };
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => active && setReducedTransparency(value))
      .catch(() => undefined);
    const transparency = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReducedTransparency,
    );
    return () => {
      active = false;
      motion?.remove();
      transparency.remove();
    };
  }, []);
  return React.createElement(
    MotionContext.Provider,
    { value: { reducedMotion, reducedTransparency } },
    children,
  );
}
export const useMotionPreferences = () => useContext(MotionContext);

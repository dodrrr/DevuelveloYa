import React, { useRef, useState } from "react";
import { Animated, Pressable, PressableProps, StyleSheet } from "react-native";
import { useMotionPreferences } from "@/hooks/use-motion-preferences";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function MotionPressable({
  style,
  onPressIn,
  onPressOut,
  ...props
}: PressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const { reducedMotion } = useMotionPreferences();
  const animate = (value: number) => {
    if (reducedMotion) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, {
      toValue: value,
      stiffness: 420,
      damping: 38,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  };
  return (
    <AnimatedPressable
      {...props}
      accessibilityRole={props.accessibilityRole ?? "button"}
      onPressIn={(event) => {
        setPressed(true);
        animate(0.975);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        animate(1);
        onPressOut?.(event);
      }}
      style={[
        StyleSheet.flatten(
          typeof style === "function"
            ? style({ pressed, hovered: false })
            : style,
        ),
        {
          transform: [{ scale }],
          opacity: props.disabled ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    />
  );
}

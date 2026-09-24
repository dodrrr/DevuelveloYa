import React from "react";
import { Text, View } from "react-native";
import { useApp } from "@/context/AppContext";
import type { DateFieldProps } from "./date-field";

export function DateField({
  label,
  value,
  minimum,
  error,
  onChange,
}: DateFieldProps) {
  const { colors } = useApp();
  return (
    <View style={{ gap: 7 }}>
      <Text
        style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}
      >
        {label}
      </Text>
      <input
        aria-label={label}
        type="date"
        value={value}
        min={minimum}
        onInput={(event) => onChange(event.currentTarget.value)}
        onChange={(event) => onChange(event.target.value)}
        style={{
          boxSizing: "border-box",
          width: "100%",
          minHeight: 54,
          borderRadius: 18,
          padding: 14,
          fontSize: 16,
          fontFamily: "inherit",
          background: colors.card,
          color: colors.foreground,
          border: `1px solid ${error ? colors.destructive : colors.border}`,
        }}
      />
      {error && (
        <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>
      )}
    </View>
  );
}

import React, { useState } from "react";
import { Keyboard, Platform, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import { useApp } from "@/context/AppContext";
import { formatDate, isoToday, parseDate } from "@/utils/return-dates";
import { MotionPressable } from "./motion-pressable";

export type DateFieldProps = {
  label: string;
  value: string;
  minimum?: string;
  error?: string;
  onChange: (value: string) => void;
};
const toLocalDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
const toISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function DateField({
  label,
  value,
  minimum,
  error,
  onChange,
}: DateFieldProps) {
  const { colors, appearance, systemScheme } = useApp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(new Date());
  const min = minimum && parseDate(minimum);
  const start = () => {
    Keyboard.dismiss();
    const seed = parseDate(value) || isoToday();
    setDraft(toLocalDate(min && seed < min ? min : seed));
    setOpen(true);
  };
  return (
    <View style={{ gap: 7 }}>
      <Text
        style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}
      >
        {label}
      </Text>
      <MotionPressable
        onPress={start}
        accessibilityLabel={`${label}: ${value ? formatDate(value) : "Seleccionar fecha"}`}
        accessibilityState={{ expanded: open }}
        style={{
          backgroundColor: colors.card,
          borderColor: error ? colors.destructive : colors.border,
          borderWidth: 1,
          borderRadius: 18,
          minHeight: 54,
          padding: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Feather name="calendar" size={19} color={colors.primary} />
        <Text
          style={{
            color: value ? colors.foreground : colors.mutedForeground,
            fontSize: 16,
            flex: 1,
          }}
        >
          {value ? formatDate(value) : "Seleccionar fecha"}
        </Text>
        <Feather name="chevron-down" size={17} color={colors.mutedForeground} />
      </MotionPressable>
      {open && (
        <View
          style={{
            borderRadius: 22,
            backgroundColor: colors.card,
            overflow: "hidden",
          }}
        >
          <DateTimePicker
            value={draft}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            locale="es-ES"
            minimumDate={min ? toLocalDate(min) : undefined}
            themeVariant={appearance === "system" ? systemScheme : appearance}
            textColor={colors.foreground}
            style={{ height: 190, width: "100%" }}
            onChange={(event, date) => {
              if (Platform.OS !== "ios") {
                setOpen(false);
                if (event.type === "set" && date) onChange(toISO(date));
              } else if (date) setDraft(date);
            }}
          />
          {Platform.OS === "ios" && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingBottom: 8,
              }}
            >
              <MotionPressable
                onPress={() => setOpen(false)}
                style={{ padding: 12 }}
              >
                <Text style={{ color: colors.mutedForeground, fontSize: 16 }}>
                  Cancelar
                </Text>
              </MotionPressable>
              <MotionPressable
                onPress={() => {
                  onChange(toISO(draft));
                  setOpen(false);
                }}
                style={{ padding: 12 }}
              >
                <Text
                  style={{
                    color: colors.primary,
                    fontWeight: "600",
                    fontSize: 16,
                  }}
                >
                  Listo
                </Text>
              </MotionPressable>
            </View>
          )}
        </View>
      )}
      {error && (
        <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>
      )}
    </View>
  );
}

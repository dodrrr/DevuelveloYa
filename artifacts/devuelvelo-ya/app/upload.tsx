import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReturnDraft, useApp } from '@/context/AppContext';
import { formatDateInput, isoToday, parseDate } from '@/utils/return-dates';

type FormValues = { title: string; store: string; price: string; purchaseDate: string; deadline: string; returnsUrl: string };

export default function UploadScreen() {
  const { colors, returns, addReturn, updateReturn } = useApp();
  const insets = useSafeAreaInsets();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const existing = returns.find((item) => item.id === edit);
  const [values, setValues] = useState<FormValues>({ title: '', store: '', price: '', purchaseDate: formatDateInput(isoToday()), deadline: '', returnsUrl: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  const editing = Boolean(existing);

  useEffect(() => {
    if (!existing) return;
    setValues({ title: existing.title, store: existing.store, price: String(existing.price).replace('.', ','), purchaseDate: formatDateInput(existing.purchaseDate), deadline: formatDateInput(existing.deadline), returnsUrl: existing.returnsUrl });
  }, [existing?.id]);

  const update = (key: keyof FormValues, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const parsedAmount = useMemo(() => Number(values.price.trim().replace(',', '.')), [values.price]);

  const save = async () => {
    const nextErrors: typeof errors = {};
    const purchaseDate = parseDate(values.purchaseDate);
    const deadline = parseDate(values.deadline);
    if (!values.title.trim()) nextErrors.title = 'Escribe el nombre del artículo.';
    if (!values.store.trim()) nextErrors.store = 'Escribe el nombre de la tienda.';
    if (!values.price.trim() || !Number.isFinite(parsedAmount) || parsedAmount < 0) nextErrors.price = 'Introduce un importe válido.';
    if (!purchaseDate) nextErrors.purchaseDate = 'Usa el formato día/mes/año.';
    if (!deadline) nextErrors.deadline = 'Usa el formato día/mes/año.';
    if (purchaseDate && deadline && deadline < purchaseDate) nextErrors.deadline = 'La fecha límite debe ser posterior a la compra.';
    if (values.returnsUrl.trim() && !/^https?:\/\//i.test(values.returnsUrl.trim())) nextErrors.returnsUrl = 'El enlace debe empezar por https://';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const draft: ReturnDraft = {
      title: values.title.trim(),
      store: values.store.trim(),
      price: parsedAmount,
      purchaseDate: purchaseDate!,
      deadline: deadline!,
      returnsUrl: values.returnsUrl.trim(),
    };
    setSaving(true);
    if (existing) updateReturn(existing.id, draft); else addReturn(draft);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(false);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top > 0 ? 8 : 18 }]}>
        <View style={styles.headerSide} />
        <View style={styles.titleGroup}><Text style={[styles.eyebrow, { color: colors.primary }]}>{editing ? 'EDITAR COMPRA' : 'NUEVA COMPRA'}</Text><Text style={[styles.title, { color: colors.foreground }]}>{editing ? 'Actualiza los datos' : 'Añadir compra'}</Text></View>
        <Pressable onPress={() => router.back()} style={[styles.closeButton, { backgroundColor: colors.secondary }]} accessibilityLabel="Cerrar"><Feather name="x" size={18} color={colors.foreground} /></Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>
        <View style={[styles.notice, { backgroundColor: colors.accent }]}><Feather name="shield" size={17} color={colors.primary} /><Text style={[styles.noticeText, { color: colors.foreground }]}>La fecha límite la confirmas tú según el pedido o la política de la tienda.</Text></View>

        <Field label="Artículo" placeholder="Ej. Auriculares inalámbricos" value={values.title} onChangeText={(value) => update('title', value)} error={errors.title} colors={colors} returnKeyType="next" />
        <Field label="Tienda" placeholder="Ej. Amazon" value={values.store} onChangeText={(value) => update('store', value)} error={errors.store} colors={colors} returnKeyType="next" />
        <Field label="Importe" placeholder="0,00 €" value={values.price} onChangeText={(value) => update('price', value.replace(/[^\d,.]/g, ''))} error={errors.price} colors={colors} keyboardType="decimal-pad" />

        <View style={styles.dateRow}>
          <View style={styles.dateColumn}><Field label="Fecha de compra" placeholder="dd/mm/aaaa" value={values.purchaseDate} onChangeText={(value) => update('purchaseDate', value)} error={errors.purchaseDate} colors={colors} keyboardType="numbers-and-punctuation" /></View>
          <View style={styles.dateColumn}><Field label="Devolver antes del" placeholder="dd/mm/aaaa" value={values.deadline} onChangeText={(value) => update('deadline', value)} error={errors.deadline} colors={colors} keyboardType="numbers-and-punctuation" /></View>
        </View>

        <Field label="Enlace de devolución (opcional)" placeholder="https://…" value={values.returnsUrl} onChangeText={(value) => update('returnsUrl', value)} error={errors.returnsUrl} colors={colors} keyboardType="url" autoCapitalize="none" />

        <View style={[styles.photoNote, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.photoIcon, { backgroundColor: colors.secondary }]}><Feather name="camera" size={17} color={colors.mutedForeground} /></View><View style={styles.photoCopy}><Text style={[styles.photoTitle, { color: colors.foreground }]}>¿Tienes el ticket?</Text><Text style={[styles.photoText, { color: colors.mutedForeground }]}>La importación desde foto estará disponible próximamente. Ahora puedes guardar la compra con estos datos.</Text></View></View>
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: colors.background, paddingBottom: insets.bottom + 10 }]}>
        <Pressable onPress={save} disabled={saving} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary, opacity: pressed || saving ? 0.82 : 1 }]}><Text style={styles.saveText}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar compra'}</Text><Feather name="arrow-right" size={17} color={colors.primaryForeground} /></Pressable>
        <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>Tus datos se guardan en este dispositivo.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, placeholder, value, onChangeText, error, colors, ...inputProps }: { label: string; placeholder: string; value: string; onChangeText: (value: string) => void; error?: string; colors: ReturnType<typeof useApp>['colors'] } & Omit<React.ComponentProps<typeof TextInput>, 'value' | 'onChangeText'>) {
  return <View style={styles.field}><Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: error ? colors.destructive : colors.border }]} accessibilityLabel={label} {...inputProps} />{error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 70, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSide: { width: 38 },
  titleGroup: { alignItems: 'center', gap: 3 },
  eyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.15 },
  title: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 22, paddingTop: 12, gap: 13 },
  notice: { borderRadius: 14, paddingHorizontal: 13, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '500' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '600' },
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, fontSize: 14 },
  error: { fontSize: 11, marginTop: -2 },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateColumn: { flex: 1 },
  photoNote: { borderWidth: 1, borderRadius: 15, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 2 },
  photoIcon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  photoCopy: { flex: 1, gap: 3 },
  photoTitle: { fontSize: 12, fontWeight: '600' },
  photoText: { fontSize: 11, lineHeight: 16 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 10 },
  saveButton: { height: 51, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  footerNote: { textAlign: 'center', fontSize: 10, marginTop: 8 },
});

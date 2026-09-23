import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';

export default function UploadScreen() {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<string | null>(null);
  const email = 'rodrigo.x7f2@devuelveloya.app';

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const copyEmail = async () => {
    await Clipboard.setStringAsync(email);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('Copiado');
  };

  const pickTicket = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso necesario', 'Permite el acceso a tus fotos para subir una imagen del ticket.', [{ text: 'Entendido' }]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true });
    if (!result.canceled) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Foto recibida. La analizaremos en breve.');
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.grabber, { backgroundColor: colors.border }]} />
      <View style={[styles.topBar, { paddingTop: insets.top > 0 ? 8 : 18 }]}>
        <Text style={[styles.topTitle, { color: colors.foreground }]}>Subir compra</Text>
        <Pressable onPress={() => router.back()} style={styles.closeButton} accessibilityLabel="Cerrar"><Feather name="x" size={22} color={colors.foreground} /></Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>Añade una compra para tener siempre a mano su fecha límite de devolución.</Text>
        <View style={styles.steps}>
          <Step number="1" title="Reenvía el email de confirmación" colors={colors} last={false}>
            <Text style={[styles.stepText, { color: colors.mutedForeground }]}>Reenvía el email de confirmación de tu compra a esta dirección única:</Text>
            <View style={[styles.emailCard, { backgroundColor: colors.secondary }]}>
              <Feather name="mail" size={16} color={colors.primary} />
              <Text style={[styles.emailText, { color: colors.foreground }]} numberOfLines={1}>{email}</Text>
              <Pressable onPress={copyEmail} style={[styles.copyButton, { backgroundColor: colors.card }]} accessibilityLabel="Copiar dirección"><Feather name="copy" size={15} color={colors.primary} /><Text style={[styles.copyText, { color: colors.primary }]}>Copiar</Text></Pressable>
            </View>
          </Step>
          <Step number="2" title="Lo detectamos automáticamente" colors={colors} last={true}>
            <Text style={[styles.stepText, { color: colors.mutedForeground }]}>En unos segundos extraeremos la tienda, el precio y los días disponibles. Aparecerá directamente en tu lista.</Text>
          </Step>
        </View>
        <View style={[styles.alternativeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.altIcon, { backgroundColor: colors.accent }]}><Feather name="camera" size={18} color={colors.primary} /></View>
          <View style={styles.altCopy}><Text style={[styles.altTitle, { color: colors.foreground }]}>¿Es una compra física?</Text><Text style={[styles.altText, { color: colors.mutedForeground }]}>Sube una foto del ticket como alternativa.</Text></View>
          <Pressable onPress={pickTicket} style={styles.altButton} accessibilityLabel="Subir foto del ticket"><Feather name="arrow-up" size={18} color={colors.primary} /></Pressable>
        </View>
        <Pressable onPress={() => router.back()} style={[styles.doneButton, { borderColor: colors.border }]}><Text style={[styles.doneText, { color: colors.foreground }]}>Entendido</Text></Pressable>
      </ScrollView>
      {toast ? <View style={[styles.toast, { backgroundColor: colors.foreground }]}><Feather name="check" size={15} color={colors.background} /><Text style={[styles.toastText, { color: colors.background }]}>{toast}</Text></View> : null}
    </View>
  );
}

function Step({ number, title, colors, last, children }: { number: string; title: string; colors: ReturnType<typeof useApp>['colors']; last: boolean; children: React.ReactNode }) {
  return <View style={styles.stepRow}><View style={styles.stepRail}><View style={[styles.stepNumber, { backgroundColor: colors.primary }]}><Text style={styles.stepNumberText}>{number}</Text></View>{!last ? <View style={[styles.stepLine, { backgroundColor: colors.border }]} /> : null}</View><View style={styles.stepBody}><Text style={[styles.stepTitle, { color: colors.foreground }]}>{title}</Text>{children}</View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  grabber: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8 },
  topBar: { minHeight: 58, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontWeight: '600' },
  closeButton: { width: 38, height: 38, borderRadius: 19, position: 'absolute', right: 16, bottom: 8, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  intro: { fontSize: 15, lineHeight: 22, marginBottom: 26 },
  steps: { marginBottom: 8 },
  stepRow: { flexDirection: 'row' },
  stepRail: { width: 34, alignItems: 'center' },
  stepNumber: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  stepLine: { width: 1, flex: 1, marginVertical: 5 },
  stepBody: { flex: 1, paddingLeft: 11, paddingBottom: 28 },
  stepTitle: { fontSize: 17, fontWeight: '600', marginBottom: 9 },
  stepText: { fontSize: 14, lineHeight: 21 },
  emailCard: { borderRadius: 14, padding: 10, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  emailText: { flex: 1, fontSize: 12, fontWeight: '500' },
  copyButton: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  copyText: { fontSize: 12, fontWeight: '600' },
  alternativeCard: { borderRadius: 16, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  altIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  altCopy: { flex: 1 },
  altTitle: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  altText: { fontSize: 12, lineHeight: 17 },
  altButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  doneButton: { height: 52, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 25 },
  doneText: { fontSize: 15, fontWeight: '600' },
  toast: { position: 'absolute', bottom: 34, alignSelf: 'center', borderRadius: 100, paddingHorizontal: 15, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 7 },
  toastText: { fontSize: 13, fontWeight: '600' },
});

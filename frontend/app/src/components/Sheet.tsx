import type { PropsWithChildren } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Circle, Label } from './ui';
import { useStudio } from '../state/Studio';

export default function Sheet({ title, visible, close, children }: PropsWithChildren<{ title: string; visible: boolean; close: () => void }>) {
  const { colors, reducedMotion } = useStudio();
  return <Modal visible={visible} presentationStyle="pageSheet" animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={close}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Label size={24} weight="600">{title}</Label>
        <Circle name="close" label={`Đóng ${title.toLowerCase()}`} onPress={close} /></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 40, gap: 18 }}>{children}</ScrollView>
    </SafeAreaView>
  </Modal>;
}

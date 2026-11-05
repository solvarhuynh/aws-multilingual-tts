import { Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Action, Circle, Empty, Icon, Label } from '../../components/ui';
import { useStudio } from '../../state/Studio';
import { usePlayback } from '../../state/Playback';
import { covers, date, languageNames, normalize, type Recording } from '../../lib/model';

export default function Library() {
  const { colors, history, removeRecording, setNotice, refresh, refreshing, cursor, setDraft } = useStudio();
  const { current, playing, play, toggle, stop } = usePlayback();
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const items = history.filter(r => normalize(`${r.text} ${r.voice} ${languageNames[r.lang]}`).includes(normalize(query)));
  const remove = (record: Recording) => {
    const execute = async () => {
      if (deleting) return;
      setDeleting(record.jobId);
      try { await removeRecording(record.jobId); if (current?.jobId === record.jobId) stop(); }
      catch (error) { setNotice(error instanceof Error ? error.message : 'Chưa xóa được bản thu.'); }
      finally { setDeleting(null); }
    };
    if (Platform.OS === 'web') { if (window.confirm('Xóa bản thu này?')) void execute(); }
    else Alert.alert('Xóa bản thu?', 'Bạn sẽ không thể khôi phục bản thu đã xóa.', [{ text: 'Giữ lại', style: 'cancel' }, { text: 'Xóa', style: 'destructive', onPress: () => void execute() }]);
  };
  return <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 210, gap: 22 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.blue} />}>
      <View style={styles.heading}><Label size={34} weight="700">Bản thu</Label><Circle name="settings" label="Mở cài đặt" onPress={() => router.push('/settings')} /></View>
      <View style={[styles.search, { backgroundColor: colors.raised }]}><Icon name="search" size={21} color={colors.secondary} />
        <TextInput value={query} onChangeText={setQuery} accessibilityLabel="Tìm bản thu" placeholder="Tìm trong bản thu của bạn…" placeholderTextColor={colors.faint}
          style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 15 }} />{!!query && <Circle name="close" size={32} label="Xóa tìm kiếm" onPress={() => setQuery('')} />}</View>
      {items.length > 0 && <Label muted size={14}>{items.length} bản thu{query ? ' phù hợp' : ' đã lưu'}</Label>}
      {items.map((record, index) => {
        const selected = current?.jobId === record.jobId;
        return <View key={record.jobId} style={[styles.record, { borderColor: colors.line }]}>
          <View style={styles.recordTop}><Pressable accessibilityRole="button" accessibilityLabel={`Mở bản thu ${record.text.slice(0, 30)}`}
            onPress={() => { void play(record); router.push('/recording'); }} style={styles.recordMain}>
            <LinearGradient colors={covers[index % covers.length]} style={styles.cover}><Icon name="wave" color="#FFFFFF" size={28} /></LinearGradient>
            <View style={{ flex: 1, gap: 8 }}><Label weight="600" size={18} lines={2}>{record.text}</Label><Label size={12} muted lines={1}>{date(record.createdAt)} · {record.voice}</Label>
              <Label size={12} muted>{languageNames[record.lang] ?? record.lang}{record.local ? ' · Nghe trên máy' : ''}</Label></View></Pressable>
            <Circle name="trash" label="Xóa bản thu" size={36} disabled={deleting === record.jobId} onPress={() => remove(record)} />
          </View>
          <View style={[styles.inlinePlayer, { backgroundColor: colors.raised }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={selected && playing ? 'Dừng bản thu' : 'Nghe bản thu'} onPress={() => selected ? void toggle() : void play(record)} style={{ padding: 9 }}>
              <Icon name={selected && playing ? 'pause' : 'play'} size={20} /></Pressable>
            <View accessibilityElementsHidden style={styles.bars}>{Array.from({ length: 36 }, (_, i) =>
              <View key={i} style={{ flex: 1, borderRadius: 4, height: 5 + ((i * 17 + index * 11) % 28), backgroundColor: selected && playing ? colors.blue : colors.faint, opacity: 0.7 }} />)}</View>
            <Pressable accessibilityRole="button" accessibilityLabel="Chỉnh sửa nội dung" onPress={() => { setDraft(record.text); router.push('/compose'); }} style={{ padding: 9 }}><Icon name="file" size={20} color={colors.secondary} /></Pressable>
          </View>
        </View>;
      })}
      {items.length === 0 && <><Empty icon="library" title={query ? 'Không tìm thấy bản thu' : 'Chưa có bản thu'}
        detail={query ? 'Tìm theo nội dung hoặc tên giọng.' : 'Bản thu mới sẽ được lưu ở đây.'} />
        {!query && <Action primary icon="plus" onPress={() => router.push('/compose')}>Tạo bản thu</Action>}</>}
      {cursor && <Action disabled={refreshing} onPress={() => void refresh(true)}>Tải thêm bản thu</Action>}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  search: { borderRadius: 28, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 10 },
  record: { gap: 16, paddingBottom: 22, borderBottomWidth: 1 }, recordTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  recordMain: { flex: 1, flexDirection: 'row', gap: 14, alignItems: 'center' },
  cover: { width: 78, height: 94, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  inlinePlayer: { flexDirection: 'row', alignItems: 'center', borderRadius: 28, padding: 6, gap: 10 },
  bars: { flex: 1, height: 34, flexDirection: 'row', alignItems: 'center', gap: 3 },
});

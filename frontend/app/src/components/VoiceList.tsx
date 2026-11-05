import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon, Label, Empty, SearchField } from './ui';
import { useStudio } from '../state/Studio';
import { usePlayback } from '../state/Playback';
import { languageNames, normalize } from '../lib/model';
import { DEMO } from '../lib/api';

export default function VoiceList({ onSelect, selected, onlyLanguage }: { onSelect?: (lang: string, id: string) => void; selected?: { lang: string; voice: string }; onlyLanguage?: string }) {
  const { languages, colors, lang, voice, selectVoice, preferences, updatePreferences, haptic } = useStudio();
  const { current, playing, play, stop } = usePlayback();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const all = useMemo(() => languages.filter(l => !onlyLanguage || l.lang === onlyLanguage).flatMap(l => l.voices.map(v => ({ ...v, lang: l.lang }))), [languages, onlyLanguage]);
  const filtered = all.filter(v => (filter === 'all' || (filter === 'saved' ? preferences.favorites.includes(`${v.lang}/${v.id}`) : v.lang === filter)) &&
    normalize(`${v.id} ${languageNames[v.lang] ?? v.lang} ${v.gender === 'F' ? 'Nữ' : 'Nam'}`).includes(normalize(query)));
  return <>
    <SearchField label="Tìm giọng đọc" placeholder="Tìm tên giọng, ngôn ngữ…" value={query} onChange={setQuery} />
    <ScrollView horizontal style={{ flexGrow: 0, flexShrink: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {[{ id: 'all', title: 'Tất cả' }, { id: 'saved', title: 'Đã lưu' }, ...languages.map(l => ({ id: l.lang, title: languageNames[l.lang] ?? l.lang }))].map(item =>
        <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: filter === item.id }} onPress={() => setFilter(item.id)}
          style={[styles.chip, { backgroundColor: filter === item.id ? colors.text : colors.raised }]}><Label size={14} weight="500"
          style={{ color: filter === item.id ? colors.bg : colors.secondary }}>{item.title}</Label></Pressable>)}
    </ScrollView>
    {DEMO && <Label muted size={12}>Nghe thử bằng giọng trên thiết bị.</Label>}
    {filtered.length === 0 && <Empty icon="mic" title="Không tìm thấy giọng" detail={filter === 'saved' ? 'Chạm trái tim để lưu giọng.' : 'Thử tên hoặc ngôn ngữ khác.'} />}
    {filtered.map((v, index) => {
      const key = `${v.lang}/${v.id}`;
      const saved = preferences.favorites.includes(key);
      const isSelected = (selected?.lang ?? lang) === v.lang && (selected?.voice ?? voice) === v.id;
      const previewing = current?.jobId === `preview-${key}` && playing;
      return <View key={key} style={[styles.voice, { borderColor: isSelected ? colors.blue : colors.line, backgroundColor: isSelected ? colors.blueSoft : colors.surface }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Chọn giọng ${v.id}, ${languageNames[v.lang]}`} accessibilityState={{ selected: isSelected }}
          onPress={() => { if (!selected) selectVoice(v.lang, v.id); haptic(); onSelect?.(v.lang, v.id); }} style={styles.voiceSelect}>
          <View style={[styles.avatar, { backgroundColor: avatarColors[index % avatarColors.length] }]}><Label size={24} weight="500" style={{ color: '#FFFFFF' }}>{v.id.charAt(0)}</Label></View>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}><Label size={18} weight="600" lines={1}>{v.id}</Label><Label size={13} muted>{languageNames[v.lang] ?? v.lang} · {v.gender === 'F' ? 'Nữ' : 'Nam'}</Label></View>
          {isSelected && <Icon name="check" color={colors.blue} size={19} />}
        </Pressable>
        <View style={[styles.voiceFooter, { borderColor: colors.line }]}>
          <Pressable accessibilityRole="button" onPress={() => {
            if (previewing) { stop(); return; }
            const text = v.lang.startsWith('vi') ? 'Xin chào, đây là giọng đọc để bạn nghe thử. Chúc bạn một ngày thật tốt lành.' :
              v.lang.startsWith('ja') ? 'こんにちは。図書館へようこそ。' : v.lang.startsWith('ko') ? '안녕하세요. 도서관에 오신 것을 환영합니다.' : 'Hello. Welcome to our voice studio. It is lovely to meet you.';
            void play({ jobId: `preview-${key}`, text, lang: v.lang, voice: v.id, speed: 1, status: 'DONE', audioUrl: null,
              charCount: text.length, createdAt: new Date().toISOString(), local: true });
          }} style={styles.preview}><Icon name={previewing ? 'stop' : 'play'} size={14} color={colors.blue} /><Label size={13} weight="500" style={{ color: colors.blue }}>{previewing ? 'Dừng nghe' : 'Nghe thử'}</Label></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={saved ? `Bỏ lưu giọng ${v.id}` : `Lưu giọng ${v.id}`} hitSlop={10}
            onPress={() => updatePreferences({ favorites: saved ? preferences.favorites.filter(id => id !== key) : [...preferences.favorites, key] })}>
            <Icon name={saved ? 'heartFill' : 'heart'} size={20} color={saved ? colors.blue : colors.secondary} /></Pressable>
        </View>
      </View>;
    })}
  </>;
}
const avatarColors = ['#659AAD', '#A18BAB', '#729994', '#B28A6E', '#7C8CB7', '#9B7A8D'];
const styles = StyleSheet.create({
  chip: { borderRadius: 22, paddingHorizontal: 17, paddingVertical: 12 },
  voice: { borderWidth: 1, borderRadius: 27, padding: 17, gap: 16 },
  voiceSelect: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 54 },
  avatar: { width: 54, height: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  voiceFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 3 },
});

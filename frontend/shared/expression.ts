const names: Record<string, string> = {
  confident: 'Tự tin', narration: 'Kể chuyện',
  neutral: 'Tự nhiên', auto: 'Tự chọn theo nội dung', cheerful: 'Vui vẻ', sad: 'Buồn', angry: 'Giận dữ',
  excited: 'Hào hứng', friendly: 'Thân thiện', hopeful: 'Hy vọng', empathetic: 'Đồng cảm', calm: 'Điềm tĩnh',
  fearful: 'Sợ hãi', terrified: 'Kinh hãi', shouting: 'Nói lớn', whispering: 'Thì thầm', serious: 'Nghiêm túc',
  chat: 'Trò chuyện', unfriendly: 'Lạnh lùng', customerservice: 'Hỗ trợ khách hàng', newscast: 'Đọc tin', 'newscast-casual': 'Tin nhẹ nhàng',
  'newscast-formal': 'Tin trang trọng', 'narration-professional': 'Thuyết minh', 'narration-relaxed': 'Kể chuyện nhẹ nhàng',
  affectionate: 'Trìu mến', assistant: 'Trợ lý', depressed: 'Trầm buồn', disgruntled: 'Không hài lòng',
  embarrassed: 'Ngượng ngùng', envious: 'Ghen tị', 'poetry-reading': 'Đọc thơ', 'sports-commentary': 'Bình luận thể thao',
  'sports-commentary-excited': 'Bình luận sôi nổi', advertisement_upbeat: 'Quảng cáo sôi động', documentary_narration: 'Phim tài liệu',
  lyrical: 'Trữ tình', gentle: 'Dịu dàng', apologetic: 'Xin lỗi', empathetic_casual: 'Đồng cảm nhẹ nhàng',
  surprised: 'Ngạc nhiên', anxious: 'Bồn chồn', curious: 'Tò mò', sarcastic: 'Mỉa mai',
  urgent: 'Khẩn trương', reassuring: 'Trấn an', mysterious: 'Bí ẩn',
};
export const expressionName = (style: string) => names[style] ?? style;
export const expressionHint = (provider?: string, styles?: string[]) => provider === 'azure' && styles === undefined
  ? 'Danh sách giọng cũ chưa có dữ liệu sắc thái. Hãy cập nhật catalog ở máy chủ.'
  : 'Giọng này chưa hỗ trợ sắc thái. Hãy chọn giọng có nhãn “Có sắc thái”.';
export function expressionOptions(styles: string[] = [], automatic = false) {
  const available = [...new Set(styles)].filter(style => style !== 'neutral' && style !== 'auto' && /^[a-z][a-z0-9_-]{0,59}$/.test(style));
  return ['neutral', ...(available.length && automatic ? ['auto'] : []), ...available]
    .map(value => ({ value, label: expressionName(value) }));
}

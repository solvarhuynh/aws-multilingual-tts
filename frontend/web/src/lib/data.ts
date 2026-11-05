import type { Language, Page } from "./types";

export const navigation: { id: Page; title: string; icon: string }[] = [
  { id: "dashboard", title: "Tổng quan", icon: "dashboard" },
  { id: "studio", title: "Tạo giọng đọc", icon: "wave" },
  { id: "translation", title: "Dịch và đọc", icon: "translate" },
  { id: "documents", title: "Đọc tài liệu", icon: "book" },
  { id: "voices", title: "Chọn giọng đọc", icon: "mic" },
  { id: "library", title: "Bản thu đã lưu", icon: "headphones" },
];

// Chỉ là dữ liệu minh họa. Khi có API, danh sách được lấy hoàn toàn từ /voices.
export const demoLanguages: Language[] = [
  {
    lang: "vi-VN",
    provider: "external",
    engine: null,
    voices: [
      { id: "Linh (demo)", gender: "F" },
      { id: "Minh (demo)", gender: "M" },
    ],
  },
  {
    lang: "en-US",
    provider: "polly",
    engine: "neural",
    voices: [
      { id: "Joanna", gender: "F" },
      { id: "Matthew", gender: "M" },
    ],
  },
  {
    lang: "ja-JP",
    provider: "polly",
    engine: "neural",
    voices: [{ id: "Takumi", gender: "M" }],
  },
  {
    lang: "ko-KR",
    provider: "polly",
    engine: "neural",
    voices: [{ id: "Seoyeon", gender: "F" }],
  },
];
export const languageNames: Record<string, string> = {
  "vi-VN": "Tiếng Việt",
  "en-US": "Tiếng Anh (Mỹ)",
  "ja-JP": "Tiếng Nhật",
  "ko-KR": "Tiếng Hàn",
  "fr-FR": "Tiếng Pháp",
  "de-DE": "Tiếng Đức",
  "es-ES": "Tiếng Tây Ban Nha",
  "cmn-CN": "Tiếng Trung",
};
export const samples: Record<string, string> = {
  "vi-VN":
    "Thư viện mở cửa từ tám giờ sáng đến sáu giờ chiều, từ thứ Hai đến thứ Bảy.\n\nBạn đọc có thể tra cứu tài liệu trực tuyến hoặc liên hệ quầy thông tin để được hỗ trợ. Vui lòng giữ yên lặng và trả sách đúng hạn.",
  "en-US":
    "The library opens at eight in the morning and closes at six in the evening, Monday through Saturday.\n\nYou can search for books online or ask at the information desk. Please keep your voice down and return your books on time.",
  "ja-JP":
    "図書館は月曜日から土曜日まで、午前八時から午後六時まで開いています。\n\n本はインターネットで検索できます。館内では静かにしてください。",
  "ko-KR":
    "도서관은 월요일부터 토요일까지, 오전 여덟 시부터 오후 여섯 시까지 운영합니다.\n\n온라인으로 도서를 검색할 수 있습니다. 도서관 안에서는 조용히 해 주세요.",
};
export const MAX_CHARS = 20000;
export const starterPresets = [
  {
    id: "announcement",
    label: "Thông báo",
    icon: "file",
    text: {
      "vi-VN":
        "Thư viện mở cửa từ tám giờ sáng đến sáu giờ chiều, từ thứ Hai đến thứ Bảy. Bạn đọc vui lòng giữ yên lặng và trả sách đúng hạn.",
      "en-US":
        "The library opens at eight in the morning and closes at six in the evening, Monday through Saturday. Please keep your voice down and return your books on time.",
    },
  },
  {
    id: "lesson",
    label: "Bài học",
    icon: "book",
    text: {
      "vi-VN":
        "Điện toán đám mây cho phép sử dụng tài nguyên máy tính qua Internet. Thay vì mua và vận hành máy chủ riêng, người dùng có thể thuê tài nguyên theo nhu cầu và trả phí dựa trên mức sử dụng.",
      "en-US":
        "Cloud computing provides access to computing resources over the Internet. Instead of buying and maintaining servers, you can use resources on demand and pay for what you need.",
    },
  },
  {
    id: "story",
    label: "Kể chuyện",
    icon: "mic",
    text: {
      "vi-VN":
        "Chiều thứ Bảy, An trở về căn nhà nhỏ của bà ngoại. Trong vườn, cây khế đã ra những chùm quả đầu tiên. Bà ngồi bên hiên, mỉm cười khi nghe tiếng cổng mở.",
      "en-US":
        "On Saturday afternoon, Anna returned to her grandmother’s house. The garden was full of flowers. Her grandmother was sitting on the porch and smiled when she heard the gate open.",
    },
  },
];
export const formatNumber = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
export const formatTime = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, "0")}`;
export const estimateDuration = (text: string, speed = 1) =>
  Math.max(1, Math.round(text.trim().split(/\s+/).filter(Boolean).length / (2.5 * speed)));
export const shortDate = (date: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function storeValue(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function validateInput(text: string, speed: number): string | null {
  if (!text.trim()) return "Bạn hãy nhập nội dung muốn chuyển thành giọng nói.";
  if (text.length > MAX_CHARS)
    return `Nội dung tối đa ${formatNumber(MAX_CHARS)} ký tự. Hãy rút gọn văn bản rồi thử lại.`;
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2)
    return "Tốc độ đọc cần nằm trong khoảng 0,5× đến 2×.";
  return null;
}

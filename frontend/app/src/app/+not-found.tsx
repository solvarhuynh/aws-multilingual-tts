import { router } from 'expo-router';
import { Action, Empty, Screen } from '../components/ui';
export default function NotFound() { return <Screen title="Không tìm thấy trang"><Empty title="Trang này chưa có" detail="Bạn có thể quay về trang chủ để tiếp tục." />
  <Action onPress={() => router.replace('/')}>Về trang chủ</Action></Screen>; }

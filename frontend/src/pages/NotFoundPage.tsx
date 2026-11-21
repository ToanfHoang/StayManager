import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/States';

export default function NotFoundPage() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <EmptyState title="Không tìm thấy trang" description="Đường dẫn không tồn tại hoặc đã bị thay đổi." action={<Link to="/"><Button>Về trang tổng quan</Button></Link>} />
    </div>
  );
}

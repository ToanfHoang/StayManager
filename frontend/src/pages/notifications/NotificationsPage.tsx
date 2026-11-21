import { PageHeader } from '../../components/ui/Card';
import { NotificationCenter } from '../../components/notifications/NotificationCenter';
import { LANDLORD_NOTIFICATION_TYPES } from '../../lib/labels';

export default function NotificationsPage() {
  return (
    <>
      <PageHeader title="Thông báo" description="Tổng hợp công nợ hằng ngày, hợp đồng sắp hết hạn và các nhắc việc khác" />
      <NotificationCenter types={LANDLORD_NOTIFICATION_TYPES} />
    </>
  );
}

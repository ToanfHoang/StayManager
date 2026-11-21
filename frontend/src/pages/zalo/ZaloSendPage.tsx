import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, MessageCircle } from 'lucide-react';
import type { Invoice } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { Card, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { FilterBar, FilterDropdown, PropertyFilter } from '../../components/ui/Filters';
import { DatePicker } from '../../components/ui/FormInput';
import { EmptyState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ZaloSendModal } from '../../components/zalo/ZaloSendModal';
import { currentPeriod, formatDate, formatDateTime, formatMoney, formatPeriod } from '../../lib/format';
import { INVOICE_STATUS } from '../../lib/labels';

/** Gửi tiền phòng hằng tháng cho người thuê qua Zalo */
export default function ZaloSendPage() {
  const [params] = useSearchParams();
  const [period, setPeriod] = useState(params.get('period') ?? currentPeriod());
  const [propertyId, setPropertyId] = useState('');
  const [zalo, setZalo] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const { data, loading, error, reload } = useApi<Invoice[]>('/invoices', { period, propertyId, zalo, status, pageSize: 200, sortBy: 'period' });
  const rows = (data ?? []).filter((i) => i.status !== 'CANCELLED').sort((a, b) => a.room.roomNumber.localeCompare(b.room.roomNumber, 'vi', { numeric: true }));
  const sentCount = rows.filter((i) => i.zaloSentAt).length;

  return (
    <>
      <PageHeader
        title="Gửi tiền phòng qua Zalo"
        description="Mỗi tháng sau khi lập hóa đơn, gửi cho từng phòng: ảnh hóa đơn (có mã QR chuyển khoản) và tin nhắn chi tiết."
        actions={<Link to="/hoa-don"><Button variant="secondary">Lập hóa đơn tháng</Button></Link>}
      />
      <Card padded={false}>
        <FilterBar>
          <DatePicker type="month" value={period} onChange={(v) => v && setPeriod(v)} aria-label="Kỳ" wrapperClassName="w-full sm:w-44" />
          <PropertyFilter value={propertyId} onChange={setPropertyId} />
          <FilterDropdown value={zalo} onChange={setZalo} allLabel="Đã gửi & chưa gửi" options={[{ value: 'unsent', label: 'Chưa gửi Zalo' }, { value: 'sent', label: 'Đã gửi Zalo' }]} />
          <FilterDropdown value={status} onChange={setStatus} allLabel="Mọi trạng thái" options={[{ value: 'OUTSTANDING', label: 'Còn nợ' }, { value: 'PAID', label: 'Đã thanh toán' }]} />
          {rows.length > 0 && !zalo && <span className="text-sm text-gray-600 sm:ml-auto">Đã gửi <b>{sentCount}</b>/{rows.length} phòng</span>}
        </FilterBar>
        <DataTable
          rows={rows}
          loading={loading}
          error={error}
          onRetry={reload}
          rowKey={(i) => i.id}
          onRowClick={(i) => setSelected(i.id)}
          empty={<EmptyState icon={<MessageCircle className="h-6 w-6" />} title={`Chưa có hóa đơn kỳ ${formatPeriod(period)}`} description="Hãy lập hóa đơn tháng trước, sau đó quay lại đây để gửi cho người thuê." action={<Link to="/hoa-don"><Button>Lập hóa đơn</Button></Link>} />}
          columns={[
            { key: 'room', header: 'Phòng', render: (i) => <><span className="font-medium text-gray-900">P.{i.room.roomNumber}</span><span className="block text-xs text-gray-500">{i.room.property.name}</span></> },
            { key: 'tenant', header: 'Người thuê', render: (i) => <>{i.contract.tenants[0]?.tenant.fullName ?? '—'}<span className="block text-xs text-gray-500">{i.contract.tenants[0]?.tenant.phone}</span></> },
            { key: 'total', header: 'Tổng tiền', align: 'right', render: (i) => <span className="font-semibold">{formatMoney(i.totalAmount)}</span> },
            { key: 'due', header: 'Hạn', render: (i) => formatDate(i.dueDate), hideOnMobile: true },
            { key: 'st', header: 'Thanh toán', render: (i) => <StatusBadge map={INVOICE_STATUS} value={i.displayStatus} />, hideOnMobile: true },
            { key: 'zalo', header: 'Zalo', render: (i) => (i.zaloSentAt ? <span className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" />{formatDateTime(i.zaloSentAt)}</span> : <span className="text-xs text-gray-400">Chưa gửi</span>) },
            { key: 'act', header: '', align: 'right', render: (i) => <Button size="sm" variant={i.zaloSentAt ? 'secondary' : 'primary'} icon={<MessageCircle className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); setSelected(i.id); }}>{i.zaloSentAt ? 'Gửi lại' : 'Gửi'}</Button> },
          ]}
        />
      </Card>
      {selected && <ZaloSendModal invoiceId={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </>
  );
}

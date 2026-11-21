import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Droplets, MinusCircle } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { DatePicker, MoneyInput, Select } from '../../components/ui/FormInput';
import { useProperties } from '../../components/ui/Filters';
import { currentPeriod, formatMoney, formatPeriod } from '../../lib/format';

interface Result {
  created: { invoiceId: number; invoiceNumber: string; roomNumber: string; total: number }[];
  skipped: { roomId: number; roomNumber: string; propertyName: string; reason: string }[];
  waterSplit?: { total: number; totalPeople: number; perPerson: number } | null;
}
interface SplitPreview { waterMode: string; totalPeople: number; rooms: { roomId: number; roomNumber: string; people: number }[] }

export function GenerateInvoicesModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { properties, options } = useProperties();
  const [period, setPeriod] = useState(currentPeriod());
  const [propertyId, setPropertyId] = useState(properties.length === 1 ? String(properties[0].id) : '');
  const [waterTotal, setWaterTotal] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const pid = propertyId || (properties.length === 1 ? String(properties[0].id) : '');
  const prop = properties.find((p) => String(p.id) === pid);
  const isSplit = prop?.waterMode === 'SPLIT_PER_PERSON';
  const splitProps = properties.filter((p) => p.waterMode === 'SPLIT_PER_PERSON');
  const { data: preview } = useApi<SplitPreview>(isSplit ? '/invoices/water-split-preview' : null, { propertyId: pid, period });
  const perPerson = isSplit && waterTotal !== '' && preview?.totalPeople ? Math.round(Number(waterTotal) / preview.totalPeople) : null;

  const run = async () => {
    if (isSplit && waterTotal === '') return toast.error('Vui lòng nhập tổng tiền nước của dãy trọ');
    setLoading(true);
    try {
      const res = await api.post<Result>('/invoices/generate', { period, propertyId: pid ? Number(pid) : undefined, waterTotal: isSplit ? Number(waterTotal) : undefined });
      setResult(res.data);
      if (res.data.created.length) toast.success(`Đã lập ${res.data.created.length} hóa đơn kỳ ${formatPeriod(period)}`);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Lập hóa đơn tháng"
      description="Tiền phòng + tiền điện theo chỉ số + tiền nước + dịch vụ cố định (wifi…)"
      footer={result ? (
        <>
          <Button variant="secondary" onClick={onClose}>Đóng</Button>
          {result.created.length > 0 && <Link to={`/gui-zalo?period=${period}`}><Button>Gửi tiền phòng qua Zalo</Button></Link>}
        </>
      ) : <><Button variant="secondary" onClick={onClose}>Hủy</Button><Button loading={loading} onClick={run}>Lập hóa đơn</Button></>}
    >
      {!result ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <DatePicker type="month" label="Kỳ hóa đơn" required value={period} onChange={(v) => v && setPeriod(v)} />
          <Select label="Khu trọ" value={pid} onChange={(e) => { setPropertyId(e.target.value); setWaterTotal(''); }} options={options} placeholder="Tất cả khu trọ" />
          {isSplit && (
            <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/50 p-4 sm:col-span-2">
              <p className="flex items-center gap-2 text-sm font-medium text-sky-900"><Droplets className="h-4 w-4" />Tiền nước chia theo đầu người</p>
              <MoneyInput label="Tổng tiền nước của cả dãy tháng này" required value={waterTotal} onChange={setWaterTotal} hint="Lấy theo hóa đơn tiền nước của công ty cấp nước" />
              {preview && (
                <div className="text-sm text-gray-700">
                  <p>Tổng số người đang ở: <b>{preview.totalPeople}</b>{perPerson !== null && <> → mỗi người <b className="text-sky-800">{formatMoney(perPerson)}</b></>}</p>
                  <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                    {preview.rooms.map((r) => (
                      <li key={r.roomId} className="flex justify-between gap-2 border-b border-sky-100 py-1">
                        <span>P.{r.roomNumber} · {r.people} người</span>
                        <span className="font-medium">{perPerson !== null ? formatMoney(perPerson * r.people) : '—'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {!pid && splitProps.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:col-span-2">
              {splitProps.map((p) => p.name).join(', ')} tính tiền nước chia đầu người – hãy chọn khu trọ để nhập tổng tiền nước, nếu không các phòng của khu này sẽ bị bỏ qua.
            </p>
          )}
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600 sm:col-span-2">
            <li>Phòng phải có <b>chỉ số điện</b> của kỳ (nhập ở mục Điện nước).</li>
            <li>Phòng đã có hóa đơn trong kỳ sẽ được bỏ qua – không tạo trùng.</li>
            <li>Tiền phòng lấy theo hợp đồng; wifi và các khoản cố định lấy theo dịch vụ của khu trọ.</li>
          </ul>
        </div>
      ) : (
        <div className="space-y-5">
          {result.waterSplit && (
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">Tiền nước {formatMoney(result.waterSplit.total)} ÷ {result.waterSplit.totalPeople} người = <b>{formatMoney(result.waterSplit.perPerson)}/người</b></p>
          )}
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Đã tạo {result.created.length} hóa đơn</h4>
            {result.created.length > 0 && (
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {result.created.map((c) => (
                  <li key={c.invoiceId} className="flex justify-between px-3 py-2 text-sm">
                    <Link to={`/hoa-don/${c.invoiceId}`} className="link">P.{c.roomNumber} · {c.invoiceNumber}</Link>
                    <span className="font-medium">{formatMoney(c.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {result.skipped.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700"><MinusCircle className="h-4 w-4" />Bỏ qua {result.skipped.length} phòng</h4>
              <ul className="divide-y divide-gray-100 rounded-lg border border-amber-200 bg-amber-50/40">
                {result.skipped.map((s) => (
                  <li key={s.roomId} className="flex justify-between gap-3 px-3 py-2 text-sm">
                    <span className="font-medium text-gray-800">P.{s.roomNumber} <span className="font-normal text-gray-500">· {s.propertyName}</span></span>
                    <span className="text-right text-amber-800">{s.reason}</span>
                  </li>
                ))}
              </ul>
              {result.skipped.some((s) => s.reason.includes('chỉ số')) && <Link to="/dien-nuoc" className="link mt-2 inline-block text-sm">→ Nhập chỉ số điện</Link>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

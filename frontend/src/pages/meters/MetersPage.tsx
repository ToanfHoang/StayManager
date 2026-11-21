import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gauge, History, Lock, Receipt, Save, Zap } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { AuditLog, MeterReading, MeterSheetRow } from '../../api/types';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Card, PageHeader } from '../../components/ui/Card';
import { Button, IconButton } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { DatePicker } from '../../components/ui/FormInput';
import { FilterBar, PropertyFilter } from '../../components/ui/Filters';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { Badge } from '../../components/ui/StatusBadge';
import { DataTable } from '../../components/ui/DataTable';
import { ConsumptionChart } from '../../components/charts/Charts';
import { currentPeriod, formatDateTime, formatMoney, formatNumber, formatPeriod } from '../../lib/format';
import { AUDIT_ACTION } from '../../lib/labels';

interface Draft { electricityPrev: string; electricityCurr: string; waterPrev: string; waterCurr: string }

const isSplit = (r: MeterSheetRow) => r.property.waterMode === 'SPLIT_PER_PERSON';

const toDraft = (r: MeterSheetRow): Draft =>
  isSplit(r)
    ? { electricityPrev: String(r.reading?.electricityPrev ?? r.suggestion.electricityPrev), electricityCurr: r.reading ? String(r.reading.electricityCurr) : '', waterPrev: '0', waterCurr: '0' }
    : r.reading
    ? { electricityPrev: String(r.reading.electricityPrev), electricityCurr: String(r.reading.electricityCurr), waterPrev: String(r.reading.waterPrev), waterCurr: String(r.reading.waterCurr) }
    : { electricityPrev: String(r.suggestion.electricityPrev), electricityCurr: '', waterPrev: String(r.suggestion.waterPrev), waterCurr: '' };

function rowError(d: Draft, split = false) {
  if (split) {
    if (d.electricityCurr === '') return null;
    if ([d.electricityPrev, d.electricityCurr].some((x) => x === '' || Number.isNaN(Number(x)) || Number(x) < 0)) return 'Chỉ số không hợp lệ';
    return Number(d.electricityCurr) < Number(d.electricityPrev) ? 'Điện mới < điện cũ' : null;
  }
  const nums = Object.values(d).map((x) => (x === '' ? NaN : Number(x)));
  if (d.electricityCurr === '' && d.waterCurr === '') return null;
  if (nums.some((n) => Number.isNaN(n) || n < 0)) return 'Chỉ số không hợp lệ';
  if (Number(d.electricityCurr) < Number(d.electricityPrev)) return 'Điện mới < điện cũ';
  if (Number(d.waterCurr) < Number(d.waterPrev)) return 'Nước mới < nước cũ';
  return null;
}

function HistoryModal({ row, onClose }: { row: MeterSheetRow; onClose: () => void }) {
  const { data, loading } = useApi<MeterReading[]>('/meter-readings/history', { roomId: row.room.id, months: 12 });
  const logs = useApi<AuditLog[]>(row.reading ? `/meter-readings/${row.reading.id}/audit` : null);
  return (
    <Modal open onClose={onClose} size="lg" title={`Lịch sử điện nước – Phòng ${row.room.roomNumber}`} description={row.property.name}>
      {loading ? <LoadingState /> : !data?.length ? <p className="text-sm text-gray-500">Chưa có dữ liệu.</p> : (
        <>
          <ConsumptionChart data={data} height={220} />
          <div className="mt-4 rounded-lg border border-gray-200">
            <DataTable
              rows={[...data].reverse()}
              rowKey={(r) => r.id}
              columns={[
                { key: 'p', header: 'Kỳ', render: (r) => formatPeriod(r.period) },
                { key: 'e', header: 'Điện (kWh)', align: 'right', render: (r) => `${formatNumber(r.electricityUsage)} · ${formatMoney(r.electricityCost)}` },
                { key: 'w', header: 'Nước (m³)', align: 'right', render: (r) => `${formatNumber(r.waterUsage)} · ${formatMoney(r.waterCost)}` },
              ]}
            />
          </div>
        </>
      )}
      {row.reading && (
        <div className="mt-5">
          <h4 className="mb-2 text-sm font-semibold text-gray-900">Nhật ký chỉnh sửa kỳ {formatPeriod(row.reading.period)}</h4>
          {!logs.data?.length ? <p className="text-sm text-gray-500">Không có.</p> : (
            <ul className="space-y-2 text-sm">
              {logs.data.map((l) => {
                const o = l.oldData as Record<string, number> | null;
                const n = l.newData as Record<string, number> | null;
                return (
                  <li key={l.id} className="rounded-lg bg-gray-50 px-3 py-2">
                    <span className="font-medium">{AUDIT_ACTION[l.action] ?? l.action}</span> · {l.user?.fullName ?? 'Hệ thống'} · <span className="text-gray-500">{formatDateTime(l.createdAt)}</span>
                    {o && n && (
                      <p className="mt-1 text-xs text-gray-600">
                        Điện {o.electricityPrev}→{o.electricityCurr} ⇒ {n.electricityPrev}→{n.electricityCurr}; Nước {o.waterPrev}→{o.waterCurr} ⇒ {n.waterPrev}→{n.waterCurr}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

const numInput = 'h-9 w-24 rounded-md border px-2 text-right text-sm focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500';

export default function MetersPage() {
  const toast = useToast();
  const [period, setPeriod] = useState(currentPeriod());
  const [propertyId, setPropertyId] = useState('');
  const { data, loading, error, reload } = useApi<{ period: string; rows: MeterSheetRow[] }>('/meter-readings/sheet', { period, propertyId });
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<MeterSheetRow | null>(null);

  useEffect(() => {
    if (data) setDrafts(Object.fromEntries(data.rows.map((r) => [r.room.id, toDraft(r)])));
  }, [data]);

  const rows = data?.rows ?? [];
  const dirty = useMemo(
    () => rows.filter((r) => {
      const d = drafts[r.room.id];
      if (!d || r.locked || (d.electricityCurr === '' && d.waterCurr === '')) return false;
      return JSON.stringify(d) !== JSON.stringify(toDraft(r));
    }),
    [rows, drafts],
  );
  const invalid = dirty.filter((r) => rowError(drafts[r.room.id], isSplit(r)));

  const update = (roomId: number, key: keyof Draft, value: string) => setDrafts((d) => ({ ...d, [roomId]: { ...d[roomId], [key]: value } }));

  const hunonic = useApi<{ connected: boolean }>('/hunonic/account');
  const [fetching, setFetching] = useState(false);
  /** Điền số điện từ công tơ Hunonic vào bảng (chưa lưu – bạn kiểm tra rồi bấm Lưu) */
  const fetchFromMeters = async () => {
    setFetching(true);
    try {
      const r = await api.get<{ roomId: number; roomNumber: string; electricityPrev: number; electricityCurr?: number; kwh?: number; note?: string; error?: string }[]>('/hunonic/readings', { period, propertyId });
      const okRows = r.data.filter((x) => x.electricityCurr !== undefined && rows.some((row) => row.room.id === x.roomId && !row.locked));
      setDrafts((d) => {
        const next = { ...d };
        for (const x of okRows) next[x.roomId] = { ...next[x.roomId], electricityPrev: String(x.electricityPrev), electricityCurr: String(x.electricityCurr) };
        return next;
      });
      const errs = r.data.filter((x) => x.error);
      if (!r.data.length) toast.error('Chưa gán công tơ cho phòng nào (Cài đặt → Công tơ Hunonic)');
      else if (okRows.length) toast.success(`Đã điền số điện ${okRows.length} phòng từ công tơ${okRows[0].note ? ` (${okRows[0].note})` : ''} – kiểm tra rồi bấm Lưu`);
      if (errs.length) toast.error(errs.map((x) => `P.${x.roomNumber}: ${x.error}`).join('; '));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setFetching(false);
    }
  };

  const saveAll = async () => {
    if (invalid.length) return toast.error(`Có ${invalid.length} phòng nhập chỉ số chưa hợp lệ`);
    const incomplete = dirty.filter((r) => drafts[r.room.id].electricityCurr === '' || drafts[r.room.id].waterCurr === '');
    if (incomplete.length) return toast.error(`Phòng ${incomplete.map((r) => r.room.roomNumber).join(', ')} cần nhập đủ chỉ số điện và nước`);
    setSaving(true);
    try {
      const res = await api.post<{ saved: number; created: number }>('/meter-readings/bulk', {
        period,
        readings: dirty.map((r) => ({ roomId: r.room.id, ...Object.fromEntries(Object.entries(drafts[r.room.id]).map(([k, v]) => [k, Number(v)])) })),
      });
      toast.success(`Đã lưu chỉ số ${res.data.saved} phòng`);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const totals = rows.reduce(
    (a, r) => {
      const d = drafts[r.room.id];
      if (!d || rowError(d, isSplit(r)) || d.electricityCurr === '' || d.waterCurr === '') return a;
      const eu = Number(d.electricityCurr) - Number(d.electricityPrev);
      const wu = Number(d.waterCurr) - Number(d.waterPrev);
      const ep = r.reading?.electricityPrice ?? r.property.electricityPrice;
      const wp = r.reading?.waterPrice ?? r.property.waterPrice;
      return { e: a.e + eu, w: a.w + wu, money: a.money + eu * ep + wu * wp };
    },
    { e: 0, w: 0, money: 0 },
  );

  return (
    <>
      <PageHeader
        title="Điện nước"
        description="Nhập chỉ số đồng hồ hằng tháng – hệ thống tự tính tiêu thụ và thành tiền theo đơn giá từng khu trọ"
        actions={
          <>
            <Link to={`/hoa-don?period=${period}`}><Button variant="secondary" icon={<Receipt className="h-4 w-4" />}>Hóa đơn kỳ này</Button></Link>
            {hunonic.data?.connected && <Button variant="secondary" icon={<Zap className="h-4 w-4" />} loading={fetching} onClick={fetchFromMeters}>Lấy số từ công tơ</Button>}
            <Button icon={<Save className="h-4 w-4" />} loading={saving} disabled={!dirty.length} onClick={saveAll}>Lưu {dirty.length ? `(${dirty.length})` : ''}</Button>
          </>
        }
      />
      <Card padded={false}>
        <FilterBar>
          <DatePicker type="month" value={period} max={currentPeriod()} onChange={(v) => v && setPeriod(v)} aria-label="Kỳ" wrapperClassName="w-full sm:w-48" />
          <PropertyFilter value={propertyId} onChange={setPropertyId} />
          <div className="flex gap-4 text-sm text-gray-600 sm:ml-auto">
            <span>Điện: <b>{formatNumber(totals.e)}</b> kWh</span>
            <span>Nước: <b>{formatNumber(totals.w)}</b> m³</span>
            <span>Thành tiền: <b>{formatMoney(totals.money)}</b></span>
          </div>
        </FilterBar>
        {loading && !data ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !rows.length ? (
          <EmptyState icon={<Gauge className="h-6 w-6" />} title="Không có phòng nào cần ghi chỉ số" description="Chỉ các phòng đang cho thuê (hoặc đã có chỉ số trong kỳ) mới hiển thị ở đây." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Phòng</th>
                  <th className="px-2 py-3 text-right" colSpan={2}>Điện cũ → mới</th>
                  <th className="px-2 py-3 text-right">Tiêu thụ</th>
                  <th className="px-2 py-3 text-right" colSpan={2}>Nước cũ → mới</th>
                  <th className="px-2 py-3 text-right">Tiêu thụ</th>
                  <th className="px-4 py-3 text-right">Thành tiền</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {rows.map((r) => {
                  const d = drafts[r.room.id] ?? toDraft(r);
                  const err = rowError(d, isSplit(r));
                  const ep = r.reading?.electricityPrice ?? r.property.electricityPrice;
                  const wp = r.reading?.waterPrice ?? r.property.waterPrice;
                  const eu = d.electricityCurr === '' ? null : Number(d.electricityCurr) - Number(d.electricityPrev);
                  const wu = d.waterCurr === '' ? null : Number(d.waterCurr) - Number(d.waterPrev);
                  const cls = (bad: boolean) => `${numInput} ${bad ? 'border-red-400 focus:ring-red-100' : 'border-gray-300 focus:ring-primary-100'}`;
                  const changed = dirty.includes(r);
                  return (
                    <tr key={r.room.id} className={changed ? 'bg-primary-50/40' : ''}>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <Link to={`/phong/${r.room.id}`} className="font-medium text-gray-900 hover:text-primary-700">P.{r.room.roomNumber}</Link>
                        <span className="block text-xs text-gray-500">{r.property.name}</span>
                        {err && <span className="block text-xs text-red-600">{err}</span>}
                      </td>
                      <td className="px-1 py-2.5 text-right"><input aria-label="Điện cũ" inputMode="decimal" className={cls(false)} disabled={r.locked} value={d.electricityPrev} onChange={(e) => update(r.room.id, 'electricityPrev', e.target.value)} /></td>
                      <td className="px-1 py-2.5 text-right"><input aria-label="Điện mới" inputMode="decimal" placeholder="Nhập" className={cls(eu !== null && eu < 0)} disabled={r.locked} value={d.electricityCurr} onChange={(e) => update(r.room.id, 'electricityCurr', e.target.value)} /></td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right text-gray-700">{eu === null ? '—' : `${formatNumber(eu)} kWh`}</td>
                      {isSplit(r) ? (
                        <td colSpan={3} className="px-2 py-2.5 text-center text-xs text-gray-500">Chia đầu người khi lập hóa đơn</td>
                      ) : (
                        <>
                      <td className="px-1 py-2.5 text-right"><input aria-label="Nước cũ" inputMode="decimal" className={cls(false)} disabled={r.locked} value={d.waterPrev} onChange={(e) => update(r.room.id, 'waterPrev', e.target.value)} /></td>
                      <td className="px-1 py-2.5 text-right"><input aria-label="Nước mới" inputMode="decimal" placeholder="Nhập" className={cls(wu !== null && wu < 0)} disabled={r.locked} value={d.waterCurr} onChange={(e) => update(r.room.id, 'waterCurr', e.target.value)} /></td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right text-gray-700">{wu === null ? '—' : `${formatNumber(wu)} m³`}</td>
                        </>
                      )}
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-gray-900">{eu !== null && wu !== null && !err ? formatMoney(eu * ep + wu * wp) : '—'}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {r.locked ? <Badge tone="gray"><Lock className="mr-1 h-3 w-3" />Đã thu tiền</Badge> : r.invoice ? <Badge tone="blue">Đã lập HĐ</Badge> : r.reading ? <Badge tone="green">Đã ghi</Badge> : <Badge tone="amber">Chưa ghi</Badge>}
                          <IconButton label="Lịch sử" onClick={() => setHistory(r)}><History className="h-4 w-4" /></IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
          Kỳ {formatPeriod(period)} · Chỉ số cũ được gợi ý từ chỉ số mới của kỳ trước. Sửa chỉ số khi hóa đơn chưa thu tiền sẽ tự cập nhật hóa đơn; mọi thay đổi đều được ghi nhật ký.
        </p>
      </Card>
      {history && <HistoryModal row={history} onClose={() => setHistory(null)} />}
    </>
  );
}

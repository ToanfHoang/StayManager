import type { Tone } from '../../lib/labels';

const tones: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-700 ring-gray-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  indigo: 'bg-primary-50 text-primary-700 ring-primary-200',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200',
};

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

/** Hiển thị trạng thái theo bảng nhãn (ROOM_STATUS, INVOICE_STATUS, …) */
export function StatusBadge({ map, value }: { map: Record<string, { label: string; tone: Tone }>; value: string | null | undefined }) {
  if (!value) return null;
  const item = map[value] ?? { label: value, tone: 'gray' as Tone };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

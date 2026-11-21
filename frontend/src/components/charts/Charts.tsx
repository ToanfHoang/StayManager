import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthRow, Occupancy } from '../../api/types';
import { compactMoney, formatMoney, formatNumber, formatPeriod } from '../../lib/format';

const C = { primary: '#4f46e5', green: '#10b981', red: '#ef4444', amber: '#f59e0b', sky: '#0ea5e9', gray: '#cbd5e1' };
const shortPeriod = (p: string) => `${p.slice(5, 7)}/${p.slice(2, 4)}`;
const axis = { fontSize: 12, fill: '#6b7280' };

export function RevenueChart({ data, height = 280 }: { data: MonthRow[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
        <XAxis dataKey="period" tickFormatter={shortPeriod} tick={axis} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={compactMoney} tick={axis} axisLine={false} tickLine={false} width={60} />
        <Tooltip formatter={(v: number) => formatMoney(v)} labelFormatter={(p: string) => `Tháng ${formatPeriod(p)}`} cursor={{ fill: '#f5f5ff' }} />
        <Bar dataKey="revenue" name="Tiền đã thu" fill={C.primary} radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function IncomeExpenseChart({ data, height = 280 }: { data: MonthRow[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, income: d.revenue + d.otherIncome }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
        <XAxis dataKey="period" tickFormatter={shortPeriod} tick={axis} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={compactMoney} tick={axis} axisLine={false} tickLine={false} width={60} />
        <Tooltip formatter={(v: number) => formatMoney(v)} labelFormatter={(p: string) => `Tháng ${formatPeriod(p)}`} cursor={{ fill: '#f8fafc' }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Thu" fill={C.green} radius={[4, 4, 0, 0]} maxBarSize={24} />
        <Bar dataKey="expense" name="Chi" fill={C.red} radius={[4, 4, 0, 0]} maxBarSize={24} />
        <Bar dataKey="net" name="Lợi nhuận" fill={C.primary} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function OccupancyChart({ data, height = 240 }: { data: Occupancy; height?: number }) {
  const rows = [
    { name: 'Đang thuê', value: data.occupied, color: C.primary },
    { name: 'Còn trống', value: data.available, color: C.green },
    { name: 'Bảo trì', value: data.maintenance, color: C.amber },
  ].filter((r) => r.value > 0);
  if (!rows.length) return <p className="py-16 text-center text-sm text-gray-500">Chưa có phòng nào</p>;
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="none">
            {rows.map((r) => <Cell key={r.name} fill={r.color} />)}
          </Pie>
          <Tooltip formatter={(v: number) => `${v} phòng`} />
          <Legend iconType="circle" verticalAlign="bottom" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 top-[38%] text-center">
        <p className="text-2xl font-semibold text-gray-900">{formatNumber(data.rate, 1)}%</p>
        <p className="text-xs text-gray-500">lấp đầy</p>
      </div>
    </div>
  );
}

export function ConsumptionChart({ data, height = 260 }: { data: { period: string; electricityUsage: number; waterUsage: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
        <XAxis dataKey="period" tickFormatter={shortPeriod} tick={axis} axisLine={false} tickLine={false} />
        <YAxis yAxisId="e" tick={axis} axisLine={false} tickLine={false} width={50} />
        <YAxis yAxisId="w" orientation="right" tick={axis} axisLine={false} tickLine={false} width={40} />
        <Tooltip formatter={(v: number, n: string) => [formatNumber(v), n]} labelFormatter={(p: string) => `Tháng ${formatPeriod(p)}`} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Line yAxisId="e" type="monotone" dataKey="electricityUsage" name="Điện (kWh)" stroke={C.amber} strokeWidth={2} dot={{ r: 3 }} />
        <Line yAxisId="w" type="monotone" dataKey="waterUsage" name="Nước (m³)" stroke={C.sky} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

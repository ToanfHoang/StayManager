import type { ReactNode } from 'react';

const accents = {
  indigo: 'bg-primary-50 text-primary-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  sky: 'bg-sky-50 text-sky-600',
  gray: 'bg-gray-100 text-gray-600',
};

export function StatCard({ label, value, icon, hint, accent = 'indigo' }: { label: string; value: ReactNode; icon?: ReactNode; hint?: ReactNode; accent?: keyof typeof accents }) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-card transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs leading-snug text-gray-500 sm:text-sm">{label}</p>
          <p className="mt-1 break-words text-lg font-semibold tracking-tight text-gray-900 sm:text-2xl">{value}</p>
          {hint && <p className="mt-1 text-xs leading-snug text-gray-500">{hint}</p>}
        </div>
        {icon && <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:flex ${accents[accent]}`}>{icon}</div>}
      </div>
    </div>
  );
}

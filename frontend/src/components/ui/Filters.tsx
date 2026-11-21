import { Search, X } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import type { Property } from '../../api/types';

export function SearchBar({ value, onChange, placeholder = 'Tìm kiếm…', className = '' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={`relative w-full sm:w-72 ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-8 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600" aria-label="Xóa tìm kiếm">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function FilterDropdown({ value, onChange, options, allLabel = 'Tất cả', label, className = '' }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
  allLabel?: string | false;
  label?: string;
  className?: string;
}) {
  return (
    <select
      aria-label={label ?? (allLabel || 'Lọc')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-10 rounded-lg border border-gray-300 bg-white px-3 pr-8 text-sm text-gray-700 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 ${className}`}
    >
      {allLabel !== false && <option value="">{allLabel}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** Danh sách khu trọ dùng cho bộ lọc / form */
export function useProperties() {
  const { data, loading } = useApi<Property[]>('/properties', { pageSize: 200, sortBy: 'name', sortDir: 'asc' });
  return { properties: data ?? [], loading, options: (data ?? []).map((p) => ({ value: p.id, label: p.name })) };
}

export function PropertyFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { options } = useProperties();
  return <FilterDropdown value={value} onChange={onChange} options={options} allLabel="Tất cả khu trọ" />;
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}

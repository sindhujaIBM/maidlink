import { Helmet } from 'react-helmet-async';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listMaids } from '../api/users';
import { Layout } from '../components/layout/Layout';
import { MaidCard } from '../components/maids/MaidCard';
import { Spinner } from '../components/ui/Spinner';
import { format } from 'date-fns';

type CleaningType = 'Standard Cleaning' | 'Deep Cleaning' | 'Move-Out/Move-In Cleaning';
const CLEANING_TYPES: CleaningType[] = ['Standard Cleaning', 'Deep Cleaning', 'Move-Out/Move-In Cleaning'];
const RATING_OPTIONS = [
  { label: 'Any', value: 0 },
  { label: '3+', value: 3 },
  { label: '4+', value: 4 },
  { label: '4.5+', value: 4.5 },
];

interface Filters {
  postalCode: string;
  date: string;
  time: string;
  cleaningType: CleaningType | '';
  maxRate: string;
  minRating: number;
}

const EMPTY_FILTERS: Filters = {
  postalCode: '',
  date: '',
  time: '',
  cleaningType: '',
  maxRate: '',
  minRating: 0,
};

function buildQueryParams(f: Filters) {
  const params: Record<string, string | number> = {};
  if (f.postalCode) params.postalCode = f.postalCode.trim();
  if (f.date)       params.availableDate = f.date;
  if (f.time)       params.startTime = f.time;
  if (f.maxRate)    params.maxRate = Number(f.maxRate);
  if (f.minRating)  params.minRating = f.minRating;
  return params;
}

function buildDetailLink(maidId: string, f: Filters) {
  const p = new URLSearchParams();
  if (f.date)          p.set('date', f.date);
  if (f.time)          p.set('time', f.time);
  if (f.cleaningType)  p.set('cleaningType', f.cleaningType);
  const qs = p.toString();
  return `/maids/${maidId}${qs ? `?${qs}` : ''}`;
}

export function MaidListPage() {
  const [draft,   setDraft]   = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);

  const { data: maids = [], isLoading, error } = useQuery({
    queryKey:  ['maids', applied],
    queryFn:   () => listMaids(buildQueryParams(applied) as Parameters<typeof listMaids>[0]),
    staleTime: 1000 * 60 * 2,
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setApplied({ ...draft });
  }

  function handleClear() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
  }

  const hasFilters = Object.entries(applied).some(([k, v]) =>
    k !== 'cleaningType' ? Boolean(v) : false
  );

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <Layout>
      <Helmet>
        <title>Book a Home Cleaner in Calgary — MaidLink</title>
        <meta name="description" content="Browse admin-verified home cleaners in Calgary. Filter by availability, cleaning type, and language. Instant online booking." />
        <meta property="og:title" content="Book a Home Cleaner in Calgary — MaidLink" />
        <meta property="og:description" content="Browse admin-verified home cleaners in Calgary. Filter by availability and book instantly." />
        <meta property="og:url" content="https://maidlink.ca/maids" />
        <link rel="canonical" href="https://maidlink.ca/maids" />
      </Helmet>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Book a Home Cleaner in Calgary</h1>
        <p className="text-sm text-gray-500 mb-6">Admin-verified residential cleaners — standard, deep, and move-out cleaning available.</p>

        {/* Filters */}
        <form onSubmit={handleSearch} className="card mb-8 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Postal code */}
            <div>
              <label className="label">Area (Postal FSA)</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. T2P"
                value={draft.postalCode}
                onChange={e => setDraft(d => ({ ...d, postalCode: e.target.value.toUpperCase() }))}
                maxLength={3}
              />
            </div>

            {/* Date */}
            <div>
              <label className="label">Date needed</label>
              <input
                type="date"
                className="input"
                min={todayStr}
                value={draft.date}
                onChange={e => setDraft(d => ({ ...d, date: e.target.value }))}
              />
            </div>

            {/* Start time */}
            <div>
              <label className="label">Start time</label>
              <input
                type="time"
                className="input"
                value={draft.time}
                onChange={e => setDraft(d => ({ ...d, time: e.target.value }))}
              />
            </div>

            {/* Max rate */}
            <div>
              <label className="label">Max rate ($/hr)</label>
              <input
                type="number"
                className="input"
                placeholder="e.g. 40"
                min={0}
                value={draft.maxRate}
                onChange={e => setDraft(d => ({ ...d, maxRate: e.target.value }))}
              />
            </div>

            {/* Min rating */}
            <div>
              <label className="label">Min rating</label>
              <div className="flex gap-2 mt-1">
                {RATING_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, minRating: opt.value }))}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                      draft.minRating === opt.value
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cleaning type — pre-fills the booking form, does not filter results */}
            <div>
              <label className="label">Type of cleaning needed</label>
              <select
                className="input"
                value={draft.cleaningType}
                onChange={e => setDraft(d => ({ ...d, cleaningType: e.target.value as CleaningType | '' }))}
              >
                <option value="">Not sure yet</option>
                {CLEANING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Pre-fills the booking form — all maids offer all types.</p>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" className="btn-primary">Search</button>
            {hasFilters && (
              <button type="button" onClick={handleClear} className="btn-secondary">Clear</button>
            )}
          </div>
        </form>

        {/* Active filter summary */}
        {hasFilters && (
          <div className="flex flex-wrap gap-2 mb-4">
            {applied.postalCode   && <FilterChip label={`Area: ${applied.postalCode}`} />}
            {applied.date         && <FilterChip label={`Date: ${format(new Date(applied.date + 'T00:00:00'), 'EEE, MMM d')}`} />}
            {applied.time         && <FilterChip label={`From: ${applied.time}`} />}
            {applied.maxRate      && <FilterChip label={`Max: $${applied.maxRate}/hr`} />}
            {applied.minRating    ? <FilterChip label={`Rating: ${applied.minRating}+★`} /> : null}
          </div>
        )}

        {/* Results */}
        {isLoading && (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            Failed to load maids. Please try again.
          </div>
        )}

        {!isLoading && !error && maids.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-4">🔍</div>
            <p className="font-medium">No maids found</p>
            <p className="text-sm mt-1">Try adjusting your filters.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {maids.map(maid => (
            <MaidCard
              key={maid.id}
              maid={maid}
              detailLink={buildDetailLink(maid.id, applied)}
            />
          ))}
        </div>
      </div>
    </Layout>
  );
}

function FilterChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-700">
      {label}
    </span>
  );
}

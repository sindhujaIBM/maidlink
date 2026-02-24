import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listMaids } from '../api/users';
import { Layout } from '../components/layout/Layout';
import { MaidCard } from '../components/maids/MaidCard';
import { Spinner } from '../components/ui/Spinner';

export function MaidListPage() {
  const [postalCode, setPostalCode] = useState('');
  const [search, setSearch]         = useState('');

  const { data: maids = [], isLoading, error } = useQuery({
    queryKey:  ['maids', search],
    queryFn:   () => listMaids(search ? { postalCode: search } : undefined),
    staleTime: 1000 * 60 * 2,
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(postalCode.trim());
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Browse Maids in Calgary</h1>

        {/* Filters */}
        <form onSubmit={handleSearch} className="card mb-8 flex gap-3">
          <div className="flex-1">
            <label className="label">Filter by Postal Code (FSA e.g. T2P)</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. T2P"
              value={postalCode}
              onChange={e => setPostalCode(e.target.value.toUpperCase())}
              maxLength={3}
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary">Search</button>
          </div>
          {search && (
            <div className="flex items-end">
              <button type="button" onClick={() => { setPostalCode(''); setSearch(''); }} className="btn-secondary">
                Clear
              </button>
            </div>
          )}
        </form>

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
            <p className="text-sm mt-1">Try a different postal code or clear the filter.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {maids.map(maid => (
            <MaidCard key={maid.id} maid={maid} />
          ))}
        </div>
      </div>
    </Layout>
  );
}

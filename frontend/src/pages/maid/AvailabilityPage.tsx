import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listMyAvailability,
  createRecurringSlot, deleteRecurringSlot,
  createOverride, deleteOverride,
} from '../../api/bookings';
import { Layout } from '../../components/layout/Layout';
import { Spinner } from '../../components/ui/Spinner';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_LABELS: Record<string, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday',
  FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
};

/** Returns true if HH:MM string a is strictly before b */
function timeBefore(a: string, b: string): boolean {
  return a < b;
}

export function AvailabilityPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['myAvailability'],
    queryFn:  listMyAvailability,
  });

  // Recurring form
  const [rDay, setRDay]     = useState('MON');
  const [rStart, setRStart] = useState('09:00');
  const [rEnd, setREnd]     = useState('17:00');
  const [rError, setRError] = useState<string | null>(null);

  // Override form
  const [oDate, setODate]      = useState('');
  const [oStart, setOStart]    = useState('09:00');
  const [oEnd, setOEnd]        = useState('17:00');
  const [oAvail, setOAvail]    = useState(true);
  const [oError, setOError]    = useState<string | null>(null);

  const addRecurring = useMutation({
    mutationFn: () => createRecurringSlot({ dayOfWeek: rDay, startTime: rStart, endTime: rEnd }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['myAvailability'] });
      setRError(null);
    },
    onError: () => setRError('Failed to add slot. Please try again.'),
  });

  const removeRecurring = useMutation({
    mutationFn: deleteRecurringSlot,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['myAvailability'] }),
  });

  const addOverride = useMutation({
    mutationFn: () => createOverride({ overrideDate: oDate, startTime: oStart, endTime: oEnd, isAvailable: oAvail }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['myAvailability'] });
      setOError(null);
    },
    onError: () => setOError('Failed to add override. Please try again.'),
  });

  const removeOverride = useMutation({
    mutationFn: deleteOverride,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['myAvailability'] }),
  });

  function handleAddRecurring() {
    if (!timeBefore(rStart, rEnd)) {
      setRError('End time must be after start time.');
      return;
    }
    setRError(null);
    addRecurring.mutate();
  }

  function handleAddOverride() {
    if (!oDate) {
      setOError('Please select a date.');
      return;
    }
    if (!timeBefore(oStart, oEnd)) {
      setOError('End time must be after start time.');
      return;
    }
    setOError(null);
    addOverride.mutate();
  }

  if (isLoading) return <Layout hideChat><div className="flex justify-center py-16"><Spinner /></div></Layout>;

  if (isError) return (
    <Layout hideChat>
      <div className="max-w-3xl mx-auto py-16 text-center">
        <p className="text-red-600 font-medium">Failed to load availability.</p>
        <p className="text-sm text-gray-500 mt-1">Please refresh the page and try again.</p>
      </div>
    </Layout>
  );

  return (
    <Layout hideChat>
      <Helmet><title>Manage Availability — MaidLink</title></Helmet>
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Manage Availability</h1>

        {/* ── Recurring ── */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Weekly Recurring Slots</h2>

          {/* Existing */}
          <div className="space-y-2 mb-4">
            {data?.recurring.length === 0 && <p className="text-sm text-gray-500">No recurring slots set.</p>}
            {data?.recurring.map(slot => (
              <div key={slot.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{DAY_LABELS[slot.dayOfWeek]}</span>
                  {' '}· {slot.startTime?.slice(0, 5)} – {slot.endTime?.slice(0, 5)}
                </span>
                <button
                  onClick={() => removeRecurring.mutate(slot.id)}
                  disabled={removeRecurring.isPending}
                  className="text-xs text-red-500 hover:underline disabled:opacity-50"
                >
                  {removeRecurring.isPending ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>

          {/* Add form */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="label">Day</label>
                <select className="input" value={rDay} onChange={e => setRDay(e.target.value)}>
                  {DAYS.map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Start</label>
                <input type="time" className="input" value={rStart} onChange={e => setRStart(e.target.value)} />
              </div>
              <div>
                <label className="label">End</label>
                <input type="time" className="input" value={rEnd} onChange={e => setREnd(e.target.value)} />
              </div>
              <button
                onClick={handleAddRecurring}
                disabled={addRecurring.isPending}
                className="btn-primary"
              >
                {addRecurring.isPending ? <Spinner size="sm" /> : '+ Add'}
              </button>
            </div>
            {rError && <p className="text-xs text-red-600">{rError}</p>}
          </div>
        </div>

        {/* ── Overrides ── */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">One-Off Overrides</h2>
          <p className="text-xs text-gray-500 mb-4">
            Add a specific available slot outside your recurring schedule, or block a time you'd normally be available.
          </p>

          {/* Existing */}
          <div className="space-y-2 mb-4">
            {data?.overrides.length === 0 && <p className="text-sm text-gray-500">No overrides.</p>}
            {data?.overrides.map(o => (
              <div key={o.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{String(o.overrideDate).slice(0, 10)}</span>
                  {' '}· {String(o.startTime).slice(0, 5)} – {String(o.endTime).slice(0, 5)}
                  <span className={`ml-2 text-xs ${o.isAvailable ? 'text-green-600' : 'text-red-500'}`}>
                    {o.isAvailable ? '(available)' : '(blocked)'}
                  </span>
                </span>
                <button
                  onClick={() => removeOverride.mutate(o.id)}
                  disabled={removeOverride.isPending}
                  className="text-xs text-red-500 hover:underline disabled:opacity-50"
                >
                  {removeOverride.isPending ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>

          {/* Add form */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="label">Date</label>
                <input type="date" className="input" value={oDate} onChange={e => setODate(e.target.value)} />
              </div>
              <div>
                <label className="label">Start</label>
                <input type="time" className="input" value={oStart} onChange={e => setOStart(e.target.value)} />
              </div>
              <div>
                <label className="label">End</label>
                <input type="time" className="input" value={oEnd} onChange={e => setOEnd(e.target.value)} />
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={oAvail ? 'avail' : 'block'} onChange={e => setOAvail(e.target.value === 'avail')}>
                  <option value="avail">Available</option>
                  <option value="block">Blocked</option>
                </select>
              </div>
              <button
                onClick={handleAddOverride}
                disabled={addOverride.isPending}
                className="btn-primary"
              >
                {addOverride.isPending ? <Spinner size="sm" /> : '+ Add'}
              </button>
            </div>
            {oError && <p className="text-xs text-red-600">{oError}</p>}
          </div>
        </div>
      </div>
    </Layout>
  );
}

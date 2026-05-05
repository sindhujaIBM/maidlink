import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMyProfile, updateMyProfile } from '../api/users';
import { Layout } from '../components/layout/Layout';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { Link } from 'react-router-dom';

export function ProfilePage() {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ['myProfile'],
    queryFn:  getMyProfile,
  });

  const [fullName, setFullName] = useState('');
  const [phone, setPhone]       = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const updateMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['myProfile'] }); setIsEditing(false); },
  });

  if (isLoading) return <Layout><div className="flex justify-center py-16"><Spinner /></div></Layout>;
  if (!profile)  return null;

  return (
    <Layout>
      <Helmet><title>My Profile — MaidLink</title></Helmet>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>

        {/* Basic info */}
        <div className="card">
          <div className="flex items-center gap-4 mb-4">
            {profile.avatarUrl
              ? <img src={profile.avatarUrl} alt="" className="h-16 w-16 rounded-full" />
              : <div className="h-16 w-16 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-2xl font-bold">{profile.fullName?.[0]}</div>
            }
            <div>
              <p className="font-semibold text-gray-900">{profile.fullName}</p>
              <p className="text-sm text-gray-500">{profile.email}</p>
              <div className="flex gap-1 mt-1">
                {profile.roles?.map((r: string) => <Badge key={r} variant="blue">{r}</Badge>)}
              </div>
            </div>
          </div>

          {isEditing ? (
            <form onSubmit={e => { e.preventDefault(); updateMutation.mutate({ fullName, phone }); }} className="space-y-3">
              <div>
                <label className="label">Full Name</label>
                <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} required />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 403 555 0123" />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={updateMutation.isPending}>Save</button>
                <button type="button" className="btn-secondary" onClick={() => setIsEditing(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <button
              className="btn-secondary text-sm"
              onClick={() => { setFullName(profile.fullName); setPhone(profile.phone || ''); setIsEditing(true); }}
            >
              Edit Profile
            </button>
          )}
        </div>

        {/* Maid signup CTA */}
        {!profile.roles?.includes('MAID') && (
          <div className="card bg-brand-50 border-brand-200">
            <h2 className="font-semibold text-brand-800 mb-1">Become a Maid on MaidLink</h2>
            <p className="text-sm text-brand-700 mb-3">Create a maid profile and start earning in Calgary.</p>
            <Link to="/maid/apply" className="btn-primary text-sm">Apply Now</Link>
          </div>
        )}
      </div>
    </Layout>
  );
}

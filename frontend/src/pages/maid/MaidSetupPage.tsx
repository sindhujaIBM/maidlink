import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMyMaidProfile, createMaidProfile, updateMaidProfile } from '../../api/users';
import { refreshToken } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';
import { CALGARY_FSA_CODES } from '../../constants/calgary';
import { Layout } from '../../components/layout/Layout';
import { Badge, statusVariant } from '../../components/ui/Badge';
import { PhotoUpload } from '../../components/profile/PhotoUpload';
import { Spinner } from '../../components/ui/Spinner';

export function MaidSetupPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { updateSession } = useAuth();

  const { data: existingProfile, isLoading } = useQuery({
    queryKey: ['myMaidProfile'],
    queryFn:  getMyMaidProfile,
    retry: false,                  // 404 if no profile yet — that's fine
  });

  const isNew = !existingProfile;

  const [bio, setBio]                   = useState(existingProfile?.bio || '');
  const [hourlyRate, setHourlyRate]     = useState(String(existingProfile?.hourly_rate || ''));
  const [serviceCodes, setServiceCodes] = useState<string[]>(existingProfile?.service_area_codes || []);
  const [experience, setExperience]     = useState(String(existingProfile?.years_experience || '0'));
  const [error, setError]               = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: isNew
      ? (data: Parameters<typeof createMaidProfile>[0]) => createMaidProfile(data)
      : (data: Parameters<typeof updateMaidProfile>[0]) => updateMaidProfile(data),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['myMaidProfile'] });
      if (isNew) {
        // Refresh the JWT so it includes the newly-granted MAID role
        try {
          const { accessToken, user } = await refreshToken();
          updateSession(accessToken, user);
        } catch { /* non-fatal — token will update on next sign-in */ }
      }
      navigate('/maid/availability');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message || 'Failed to save profile';
      setError(msg);
    },
  });

  function toggleCode(code: string) {
    setServiceCodes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    saveMutation.mutate({
      bio:              bio || undefined,
      hourlyRate:       parseFloat(hourlyRate),
      serviceAreaCodes: serviceCodes,
      yearsExperience:  parseInt(experience),
    });
  }

  if (isLoading) return <Layout><div className="flex justify-center py-16"><Spinner /></div></Layout>;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {isNew ? 'Create Maid Profile' : 'Edit Maid Profile'}
        </h1>

        {existingProfile && (
          <div className="mb-6 flex items-center gap-2 text-sm">
            <span className="text-gray-600">Status:</span>
            <Badge variant={statusVariant(existingProfile.status)}>{existingProfile.status}</Badge>
            {existingProfile.status === 'PENDING' && (
              <span className="text-gray-500">— Awaiting admin approval before you appear in search results.</span>
            )}
          </div>
        )}

        {existingProfile && !isNew && (
          <div className="card mb-6">
            <h2 className="font-semibold text-gray-800 mb-3">Profile Photo</h2>
            <PhotoUpload
              currentPhotoUrl={existingProfile.photoUrl}
              onUploaded={(s3Key) => qc.invalidateQueries({ queryKey: ['myMaidProfile'] })}
            />
          </div>
        )}

        <form onSubmit={handleSubmit} className="card space-y-5">
          <div>
            <label className="label">Bio</label>
            <textarea
              className="input"
              rows={3}
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Tell customers about your experience, approach, and what makes you great…"
            />
          </div>

          <div>
            <label className="label">Hourly Rate (CAD) *</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="number"
                className="input pl-7"
                required
                min="1"
                step="0.01"
                value={hourlyRate}
                onChange={e => setHourlyRate(e.target.value)}
                placeholder="35.00"
              />
            </div>
          </div>

          <div>
            <label className="label">Years Experience *</label>
            <input
              type="number"
              className="input"
              required
              min="0"
              value={experience}
              onChange={e => setExperience(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Service Areas (Calgary FSA codes) *</label>
            <p className="text-xs text-gray-500 mb-2">Select all Calgary neighbourhoods you cover.</p>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
              {CALGARY_FSA_CODES.map(code => (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleCode(code)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    serviceCodes.includes(code)
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
            {serviceCodes.length === 0 && (
              <p className="mt-1 text-xs text-red-500">Please select at least one service area.</p>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={saveMutation.isPending || serviceCodes.length === 0}>
            {saveMutation.isPending ? <Spinner size="sm" /> : null}
            {isNew ? 'Submit for Approval' : 'Save Changes'}
          </button>
        </form>
      </div>
    </Layout>
  );
}

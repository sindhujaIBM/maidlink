import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMyMaidProfile, createMaidProfile, updateMaidProfile,
  getPhotoUploadUrl, uploadPhotoToS3,
  getIdDocUploadUrl, uploadIdDocToS3,
} from '../../api/users';
import { refreshToken } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';
import { CALGARY_FSA_CODES } from '../../constants/calgary';
import { Layout } from '../../components/layout/Layout';
import { Badge, statusVariant } from '../../components/ui/Badge';
import { VerifiedBadge } from '../../components/ui/VerifiedBadge';
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

  // ── Photo (inline upload for new profiles) ────────────────────────────────
  const [photoS3Key, setPhotoS3Key]         = useState<string | null>(null);
  const [photoPreview, setPhotoPreview]     = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError]         = useState<string | null>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);

  // ── ID doc ────────────────────────────────────────────────────────────────
  const [idDocS3Key, setIdDocS3Key]         = useState<string | null>(existingProfile?.id_doc_s3_key || null);
  const [idDocUploading, setIdDocUploading] = useState(false);
  const [idDocError, setIdDocError]         = useState<string | null>(null);
  const idDocRef = useRef<HTMLInputElement>(null);

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

  // Inline photo upload (used on new-profile form — doesn't auto-save to profile)
  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setPhotoError('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { setPhotoError('Image must be under 5 MB'); return; }

    setPhotoError(null);
    setPhotoUploading(true);

    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);

    try {
      const { uploadUrl, s3Key } = await getPhotoUploadUrl();
      await uploadPhotoToS3(uploadUrl, file);
      setPhotoS3Key(s3Key);
    } catch {
      setPhotoError('Upload failed. Please try again.');
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleIdDocChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setIdDocError('File must be under 10 MB'); return; }

    setIdDocError(null);
    setIdDocUploading(true);
    try {
      const { uploadUrl, s3Key } = await getIdDocUploadUrl();
      await uploadIdDocToS3(uploadUrl, file);
      if (isNew) {
        // For new profiles: hold the key in state and send it with createMaidProfile
        setIdDocS3Key(s3Key);
      } else {
        // For existing profiles: persist immediately
        await updateMaidProfile({ idDocS3Key: s3Key });
        setIdDocS3Key(s3Key);
      }
    } catch {
      setIdDocError('Upload failed. Please try again.');
    } finally {
      setIdDocUploading(false);
    }
  }

  function toggleCode(code: string) {
    setServiceCodes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isNew) {
      if (!photoS3Key)  { setError('Please upload a profile photo before submitting.'); return; }
      if (!idDocS3Key)  { setError('Please upload a government ID document before submitting.'); return; }
      saveMutation.mutate({
        bio:              bio || undefined,
        hourlyRate:       parseFloat(hourlyRate),
        serviceAreaCodes: serviceCodes,
        yearsExperience:  parseInt(experience),
        photoS3Key,
        idDocS3Key,
      });
    } else {
      saveMutation.mutate({
        bio:              bio || undefined,
        hourlyRate:       parseFloat(hourlyRate),
        serviceAreaCodes: serviceCodes,
        yearsExperience:  parseInt(experience),
      });
    }
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

        {/* ── Profile Photo ─────────────────────────────────────────────── */}
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-800 mb-1">
            Profile Photo {isNew && <span className="text-red-500">*</span>}
          </h2>
          <p className="text-xs text-gray-500 mb-3">A clear photo helps customers recognise you.</p>

          {isNew ? (
            /* Inline upload for new profiles — key is held in state */
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
                {photoPreview
                  ? <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                  : <span className="text-gray-400 text-3xl">👤</span>
                }
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => photoFileRef.current?.click()}
                  disabled={photoUploading}
                  className="btn-secondary text-sm disabled:opacity-50"
                >
                  {photoUploading ? <Spinner size="sm" /> : null}
                  {photoUploading ? 'Uploading…' : photoS3Key ? 'Change Photo' : 'Upload Photo'}
                </button>
                {photoS3Key && <p className="mt-1 text-xs text-green-700">Photo uploaded</p>}
                <p className="mt-1 text-xs text-gray-400">JPEG · max 5 MB</p>
                {photoError && <p className="mt-1 text-xs text-red-600">{photoError}</p>}
                <input
                  ref={photoFileRef}
                  type="file"
                  accept="image/jpeg,image/jpg"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </div>
            </div>
          ) : (
            /* Existing profile — PhotoUpload auto-saves via updateMaidProfile */
            <PhotoUpload
              currentPhotoUrl={existingProfile.photoUrl}
              onUploaded={() => qc.invalidateQueries({ queryKey: ['myMaidProfile'] })}
            />
          )}
        </div>

        {/* ── ID Verification ──────────────────────────────────────────── */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-800">
              Government ID {isNew && <span className="text-red-500">*</span>}
            </h2>
            {existingProfile?.is_verified && <VerifiedBadge />}
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Upload a government-issued photo ID. Admins review it manually and grant a Verified badge once confirmed.
          </p>
          <div className="flex items-center gap-4">
            <div>
              {existingProfile?.is_verified ? (
                <p className="text-sm text-green-700 font-medium">Identity verified</p>
              ) : idDocS3Key ? (
                <p className="text-sm text-yellow-700">
                  {isNew ? 'Document ready to submit' : 'Document submitted — pending admin review'}
                </p>
              ) : (
                <p className="text-sm text-gray-500">Not submitted</p>
              )}
              <button
                type="button"
                onClick={() => idDocRef.current?.click()}
                disabled={idDocUploading || existingProfile?.is_verified}
                className="mt-2 btn-secondary text-sm disabled:opacity-50"
              >
                {idDocUploading ? <Spinner size="sm" /> : null}
                {idDocUploading ? 'Uploading…' : idDocS3Key ? 'Replace Document' : 'Upload ID Document'}
              </button>
              <p className="mt-1 text-xs text-gray-400">PDF, JPEG, or PNG · max 10 MB</p>
              {idDocError && <p className="mt-1 text-xs text-red-600">{idDocError}</p>}
              <input
                ref={idDocRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,application/pdf"
                onChange={handleIdDocChange}
                className="hidden"
              />
            </div>
          </div>
        </div>

        {/* ── Profile details form ─────────────────────────────────────── */}
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

          {isNew && (!photoS3Key || !idDocS3Key) && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              Please upload your <strong>profile photo</strong> and <strong>government ID</strong> above before submitting.
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
          )}

          <button
            type="submit"
            className="btn-primary w-full disabled:opacity-50"
            disabled={
              saveMutation.isPending ||
              serviceCodes.length === 0 ||
              (isNew && (!photoS3Key || !idDocS3Key))
            }
          >
            {saveMutation.isPending ? <Spinner size="sm" /> : null}
            {isNew ? 'Submit for Approval' : 'Save Changes'}
          </button>
        </form>
      </div>
    </Layout>
  );
}

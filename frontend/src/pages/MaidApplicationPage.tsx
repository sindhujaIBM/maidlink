import { Helmet } from 'react-helmet-async';
import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { submitMaidApplication } from '../api/maidApplications';
import {
  getPhotoUploadUrl, uploadPhotoToS3,
  getIdDocUploadUrl, uploadIdDocToS3,
} from '../api/users';
import { Spinner } from '../components/ui/Spinner';

const LANGUAGES = ['English', 'French', 'Punjabi', 'Hindi', 'Tagalog', 'Mandarin', 'Other'];
const REFERRAL_OPTIONS = ['Google', 'Facebook', 'Instagram', 'LinkedIn', 'Friend/Family', 'Flyer', 'Other'];

export function MaidApplicationPage() {
  // Personal
  const [fullName, setFullName]         = useState('');
  const [email, setEmail]               = useState('');
  const [phone, setPhone]               = useState('');
  const [gender, setGender]             = useState('');
  const [age, setAge]                   = useState('');
  const [workEligibility, setWorkElig]  = useState('');

  // Experience & preferences
  const [yearsExp, setYearsExp]         = useState('0');
  const [bio, setBio]                   = useState('');
  const [hourlyRate, setHourlyRate]     = useState('');
  const [hasSupplies, setHasSupplies]   = useState(false);
  const [canDrive, setCanDrive]         = useState(false);
  const [offersCooking, setOffersCooking] = useState(false);
  const [languages, setLanguages]       = useState<string[]>([]);
  const [availability, setAvailability] = useState('');
  const [referral, setReferral]         = useState('');

  // Optional uploads
  const [photoS3Key, setPhotoS3Key]     = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError]     = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const [idDocS3Key, setIdDocS3Key]     = useState<string | null>(null);
  const [idUploading, setIdUploading]   = useState(false);
  const [idError, setIdError]           = useState<string | null>(null);
  const idRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [submitted, setSubmitted]       = useState(false);
  const [tncAccepted, setTncAccepted]   = useState(false);
  const [tncOpen, setTncOpen]           = useState(false);

  function toggleLanguage(lang: string) {
    setLanguages(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setPhotoError('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024)    { setPhotoError('Image must be under 5 MB'); return; }
    setPhotoError(null);
    setPhotoUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
    try {
      const { uploadUrl, s3Key } = await getPhotoUploadUrl();
      await uploadPhotoToS3(uploadUrl, file);
      setPhotoS3Key(s3Key);
    } catch { setPhotoError('Upload failed. Please try again.'); }
    finally  { setPhotoUploading(false); }
  }

  async function handleIdChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setIdError('File must be under 10 MB'); return; }
    setIdError(null);
    setIdUploading(true);
    try {
      const { uploadUrl, s3Key } = await getIdDocUploadUrl();
      await uploadIdDocToS3(uploadUrl, file);
      setIdDocS3Key(s3Key);
    } catch { setIdError('Upload failed. Please try again.'); }
    finally  { setIdUploading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (languages.length === 0) { setError('Please select at least one language.'); return; }
    if (!tncAccepted) { setError('Please read and accept the Terms & Conditions to continue.'); return; }
    setSubmitting(true);
    try {
      await submitMaidApplication({
        fullName, email, phone, gender, age: Number(age),
        workEligibility, yearsExperience: Number(yearsExp),
        bio: bio || undefined, hourlyRatePref: hourlyRate ? Number(hourlyRate) : undefined,
        hasOwnSupplies: hasSupplies, canDrive, offersCooking, languages, availability,
        photoS3Key: photoS3Key || undefined, idDocS3Key: idDocS3Key || undefined,
        referralSource: referral || undefined,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Application received!</h1>
        <p className="text-gray-500 max-w-sm mb-6">
          Thanks for applying to join MaidLink. We'll review your application and reach out within 2–3 business days.
        </p>
        <Link to="/" className="btn-primary">Back to Home</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Become a Cleaner in Calgary — MaidLink</title>
        <meta name="description" content="Apply to join MaidLink as a home cleaner in Calgary. Set your own hours, get matched with verified clients, and grow your cleaning business." />
        <meta property="og:title" content="Become a Cleaner in Calgary — MaidLink" />
        <meta property="og:description" content="Apply to join MaidLink as a home cleaner in Calgary. Set your own hours and grow your cleaning business." />
        <meta property="og:url" content="https://maidlink.ca/become-a-maid" />
        <link rel="canonical" href="https://maidlink.ca/become-a-maid" />
      </Helmet>
      {/* Header */}
      <div className="border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <Link to="/">
          <img src="/logo-full.png" alt="MaidLink" className="h-8 w-auto" />
        </Link>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Join MaidLink as a Cleaner</h1>
        <p className="text-gray-500 mb-8 text-sm">
          We're building Calgary's best cleaning platform. Fill in the form below and we'll be in touch.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Personal Info ─────────────────────────────────── */}
          <section className="card space-y-4">
            <h2 className="font-semibold text-gray-800 text-base">Personal Information</h2>

            <div>
              <label className="label">Full Name *</label>
              <input className="input" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Email *</label>
                <input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@email.com" />
              </div>
              <div>
                <label className="label">Phone *</label>
                <input className="input" type="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="403-555-0100" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Gender *</label>
                <select className="input" required value={gender} onChange={e => setGender(e.target.value)}>
                  <option value="">Select…</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Non-binary</option>
                  <option>Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className="label">Age *</label>
                <input className="input" type="number" required min="18" max="80" value={age} onChange={e => setAge(e.target.value)} placeholder="30" />
              </div>
            </div>

            <div>
              <label className="label">Eligible to work in Canada? *</label>
              <select className="input" required value={workEligibility} onChange={e => setWorkElig(e.target.value)}>
                <option value="">Select…</option>
                <option value="citizen_pr">Yes — Citizen or Permanent Resident</option>
                <option value="work_permit">Yes — Valid Work Permit</option>
                <option value="student_permit">Yes — Student Permit (part-time allowed)</option>
                <option value="no">No</option>
              </select>
            </div>
          </section>

          {/* ── Experience ──────────────────────────────────────── */}
          <section className="card space-y-4">
            <h2 className="font-semibold text-gray-800 text-base">Experience & Preferences</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Years of Cleaning Experience *</label>
                <input className="input" type="number" required min="0" value={yearsExp} onChange={e => setYearsExp(e.target.value)} />
              </div>
              <div>
                <label className="label">Preferred Hourly Rate (CAD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input className="input pl-7" type="number" min="1" step="0.01" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="35.00" />
                </div>
              </div>
            </div>

            <div>
              <label className="label">Tell us about yourself</label>
              <textarea className="input" rows={3} value={bio} onChange={e => setBio(e.target.value)} placeholder="Your cleaning approach, any specialties, what makes you great…" />
            </div>

            <div>
              <label className="label">Availability *</label>
              <select className="input" required value={availability} onChange={e => setAvailability(e.target.value)}>
                <option value="">Select…</option>
                <option value="weekdays">Weekdays only</option>
                <option value="weekends">Weekends only</option>
                <option value="both">Weekdays & Weekends</option>
                <option value="flexible">Fully flexible</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="label">Additional capabilities</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" checked={hasSupplies} onChange={e => setHasSupplies(e.target.checked)} />
                <span className="text-sm text-gray-700">I have my own cleaning supplies</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" checked={canDrive} onChange={e => setCanDrive(e.target.checked)} />
                <span className="text-sm text-gray-700">I have a valid driver's licence and can drive to jobs</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" checked={offersCooking} onChange={e => setOffersCooking(e.target.checked)} />
                <span className="text-sm text-gray-700">I can offer cooking / meal prep as an add-on service</span>
              </label>
            </div>

            <div>
              <label className="label">Languages spoken *</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLanguage(lang)}
                    className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                      languages.includes(lang)
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
              {languages.length === 0 && <p className="mt-1 text-xs text-gray-400">Select at least one</p>}
            </div>
          </section>

          {/* ── Documents (optional) ────────────────────────────── */}
          <section className="card space-y-4">
            <div>
              <h2 className="font-semibold text-gray-800 text-base">Documents <span className="text-gray-400 font-normal text-sm">(optional — can be submitted later)</span></h2>
              <p className="text-xs text-gray-500 mt-1">Uploading now speeds up onboarding once we reach out.</p>
            </div>

            {/* Profile photo */}
            <div>
              <label className="label">Profile Photo</label>
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
                  {photoPreview
                    ? <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                    : <span className="text-gray-400 text-2xl">👤</span>
                  }
                </div>
                <div>
                  <button type="button" onClick={() => photoRef.current?.click()} disabled={photoUploading} className="btn-secondary text-sm disabled:opacity-50">
                    {photoUploading ? <><Spinner size="sm" /> Uploading…</> : photoS3Key ? 'Change Photo' : 'Upload Photo'}
                  </button>
                  {photoS3Key && <p className="mt-1 text-xs text-green-700">Photo uploaded ✓</p>}
                  <p className="mt-1 text-xs text-gray-400">JPEG · max 5 MB</p>
                  {photoError && <p className="mt-1 text-xs text-red-600">{photoError}</p>}
                  <input ref={photoRef} type="file" accept="image/jpeg,image/jpg" onChange={handlePhotoChange} className="hidden" />
                </div>
              </div>
            </div>

            {/* Govt ID */}
            <div>
              <label className="label">Government ID</label>
              <p className="text-xs text-gray-500 mb-2">Passport, PR card, driver's licence, or work permit.</p>
              <button type="button" onClick={() => idRef.current?.click()} disabled={idUploading} className="btn-secondary text-sm disabled:opacity-50">
                {idUploading ? <><Spinner size="sm" /> Uploading…</> : idDocS3Key ? 'Replace Document' : 'Upload ID Document'}
              </button>
              {idDocS3Key && <p className="mt-1 text-xs text-green-700">Document uploaded ✓</p>}
              <p className="mt-1 text-xs text-gray-400">PDF, JPEG, or PNG · max 10 MB</p>
              {idError && <p className="mt-1 text-xs text-red-600">{idError}</p>}
              <input ref={idRef} type="file" accept="image/jpeg,image/jpg,image/png,application/pdf" onChange={handleIdChange} className="hidden" />
            </div>
          </section>

          {/* ── How did you hear about us ──────────────────────── */}
          <section className="card">
            <label className="label">How did you hear about MaidLink?</label>
            <select className="input mt-1" value={referral} onChange={e => setReferral(e.target.value)}>
              <option value="">Select…</option>
              {REFERRAL_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </section>

          {/* ── Terms & Conditions ──────────────────────── */}
          <section className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 text-base">Terms &amp; Conditions</h2>
              <button type="button" onClick={() => setTncOpen(o => !o)}
                className="text-xs text-brand-600 hover:underline">
                {tncOpen ? 'Hide' : 'Read full terms'}
              </button>
            </div>

            {tncOpen && (
              <div className="text-xs text-gray-600 leading-relaxed space-y-3 max-h-64 overflow-y-auto border border-gray-100 rounded-lg p-3 bg-gray-50">
                <p><strong>Last updated: {new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></p>

                <p><strong>1. Collection of Personal Information</strong><br />
                By submitting this application, you consent to MaidLink Inc. ("MaidLink", "we", "us") collecting the personal information provided in this form, including your name, contact details, age, gender, work eligibility status, employment history, and any documents uploaded. This information is collected under the authority of Alberta's <em>Personal Information Protection Act (PIPA)</em> and Canada's <em>Personal Information Protection and Electronic Documents Act (PIPEDA)</em>.</p>

                <p><strong>2. Purpose of Collection</strong><br />
                Your information is collected solely for the purpose of evaluating your application to work as an independent cleaning professional through the MaidLink platform. It will be used to: (a) assess your eligibility and suitability; (b) verify your identity and right to work in Canada; (c) contact you regarding your application status; and (d) onboard you onto the platform if your application is successful.</p>

                <p><strong>3. Use and Disclosure</strong><br />
                MaidLink will not sell, rent, or share your personal information with third parties except: (a) as required by law or court order; (b) to verify your identity or work eligibility with authorised agencies; or (c) with your explicit written consent. Internally, access is limited to personnel directly involved in the hiring and onboarding process.</p>

                <p><strong>4. Data Storage and Security</strong><br />
                Your data is stored securely on AWS infrastructure located in Canada (ca-west-1 / Calgary region). We implement industry-standard security measures including encryption at rest and in transit. Uploaded documents (photo ID, profile photo) are stored in a private, access-controlled S3 bucket and are not publicly accessible.</p>

                <p><strong>5. Retention</strong><br />
                If your application is unsuccessful, your personal information will be retained for a maximum of 12 months from the date of submission, after which it will be securely deleted. If your application is successful and you join the platform, your information will be retained for the duration of your engagement with MaidLink and for a minimum of 7 years thereafter as required by Canadian employment and tax laws.</p>

                <p><strong>6. Your Rights</strong><br />
                You have the right to: (a) access the personal information we hold about you; (b) request correction of inaccurate information; (c) withdraw your consent and request deletion of your data at any time before onboarding by emailing <strong>muni@maidlink.ca</strong>; and (d) file a complaint with the Office of the Privacy Commissioner of Canada or the Office of the Information and Privacy Commissioner of Alberta.</p>

                <p><strong>7. Background Checks</strong><br />
                By submitting this application you acknowledge that MaidLink may, at its discretion and with your separate written consent, conduct a criminal record check and/or reference check as part of the verification process prior to onboarding.</p>

                <p><strong>8. Independent Contractor Status</strong><br />
                Submission of this application does not constitute an offer of employment. If accepted onto the platform, you will operate as an independent contractor, not an employee of MaidLink. You are responsible for your own taxes, insurance, and compliance with applicable laws.</p>

                <p><strong>9. Accuracy of Information</strong><br />
                By submitting this form you confirm that all information provided is accurate and complete to the best of your knowledge. Providing false or misleading information will result in immediate disqualification and, if discovered after onboarding, termination of your account.</p>

                <p><strong>10. Contact</strong><br />
                For all inquiries: <strong>muni@maidlink.ca</strong></p>
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="rounded mt-0.5 flex-shrink-0"
                checked={tncAccepted}
                onChange={e => setTncAccepted(e.target.checked)}
              />
              <span className="text-sm text-gray-700">
                I have read and agree to MaidLink's{' '}
                <button type="button" onClick={() => setTncOpen(true)} className="text-brand-600 hover:underline">
                  Terms &amp; Conditions
                </button>
                {' '}and consent to the collection and use of my personal information as described above.
              </span>
            </label>
          </section>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
          )}

          <button type="submit" disabled={submitting || !tncAccepted} className="btn-primary w-full py-3 text-base disabled:opacity-50">
            {submitting ? <><Spinner size="sm" /> Submitting…</> : 'Submit Application'}
          </button>

          <p className="text-center text-xs text-gray-400">
            Already have an account?{' '}
            <Link to="/" className="text-brand-600 hover:underline">Back to home</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

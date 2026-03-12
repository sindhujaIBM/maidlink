import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listBookings, completeBooking, getAfterPhotoUploadUrl, submitAfterPhotos } from '../../api/bookings';
import { Layout } from '../../components/layout/Layout';
import { Badge, statusVariant } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { format } from 'date-fns';

export function MaidBookingsPage() {
  const qc = useQueryClient();
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const pendingBooking = useRef<string | null>(null); // which booking the next file input change is for

  const [uploadingFor,   setUploadingFor]   = useState<string | null>(null);
  const [uploadError,    setUploadError]    = useState<string | null>(null);
  const [uploadedFor,    setUploadedFor]    = useState<Set<string>>(new Set());

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings', 'maid'],
    queryFn:  () => listBookings({ role: 'maid' }),
  });

  const completeMutation = useMutation({
    mutationFn: completeBooking,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });

  async function handleAfterPhotoUpload(bookingId: string, files: FileList | null) {
    if (!files || files.length === 0) { setUploadingFor(null); return; }

    setUploadingFor(bookingId);
    setUploadError(null);

    const toUpload = Array.from(files).slice(0, 10);
    const submittedKeys: string[] = [];

    try {
      for (const file of toUpload) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 10 * 1024 * 1024) { setUploadError('Each photo must be under 10 MB'); continue; }
        const { uploadUrl, s3Key } = await getAfterPhotoUploadUrl(bookingId);
        await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: file });
        submittedKeys.push(s3Key);
      }
      if (submittedKeys.length > 0) {
        await submitAfterPhotos(bookingId, submittedKeys);
        setUploadedFor(prev => new Set(prev).add(bookingId));
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploadingFor(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function triggerUpload(bookingId: string) {
    pendingBooking.current = bookingId;
    fileInputRef.current?.click();
  }

  const now = new Date();

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Incoming Bookings</h1>

        {isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}

        {!isLoading && bookings.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <div className="text-4xl mb-4">📋</div>
            <p className="font-medium">No bookings yet</p>
          </div>
        )}

        <div className="space-y-4">
          {bookings.map(b => {
            const started         = new Date(b.startAt) < now;
            const canComplete     = b.status === 'CONFIRMED' && started;
            const canUpload       = b.status === 'COMPLETED';
            const isUploading     = uploadingFor === b.id;
            const alreadyUploaded = uploadedFor.has(b.id) || (b.afterPhotoKeys?.length ?? 0) > 0;

            return (
              <div key={b.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{b.customerName}</span>
                      <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
                    </div>
                    <p className="text-sm text-gray-600">
                      {format(new Date(b.startAt), 'EEE, MMM d, yyyy')} · {b.startAt.slice(11,16)} – {b.endAt.slice(11,16)}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">{b.addressLine1}, {b.postalCode}</p>
                    {b.notes && <p className="text-xs text-gray-400 mt-1 italic">"{b.notes}"</p>}

                    {/* Before photos indicator */}
                    {(b.beforePhotoKeys?.length ?? 0) > 0 && (
                      <p className="text-xs text-brand-500 mt-1">
                        📸 Customer uploaded {b.beforePhotoKeys!.length} before photo{b.beforePhotoKeys!.length > 1 ? 's' : ''}
                      </p>
                    )}

                    {/* Completion photo upload */}
                    {canUpload && (
                      <div className="mt-3">
                        {alreadyUploaded && !isUploading ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-green-600 font-medium">Completion photos uploaded</span>
                            <button onClick={() => triggerUpload(b.id)} className="text-xs text-brand-500 hover:underline">
                              Add more
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => triggerUpload(b.id)}
                            disabled={!!uploadingFor}
                            className="flex items-center gap-1.5 text-xs text-brand-600 hover:underline disabled:opacity-50"
                          >
                            {isUploading
                              ? <><Spinner size="sm" /> Uploading…</>
                              : '📷 Upload completion photos'}
                          </button>
                        )}
                        {uploadError && uploadingFor === null && uploadedFor.size === 0 && (
                          <p className="text-xs text-red-600 mt-1">{uploadError}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-gray-900">${parseFloat(b.totalPrice).toFixed(2)}</p>
                    {canComplete && (
                      <button
                        onClick={() => { if (confirm('Mark this job as complete?')) completeMutation.mutate(b.id); }}
                        disabled={completeMutation.isPending}
                        className="mt-2 text-xs text-brand-600 hover:underline disabled:opacity-50"
                      >
                        {completeMutation.isPending ? 'Updating…' : 'Mark as Complete'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Single hidden file input shared across all booking rows */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png"
        multiple
        className="hidden"
        onChange={e => {
          const id = pendingBooking.current;
          if (id) handleAfterPhotoUpload(id, e.target.files);
        }}
      />
    </Layout>
  );
}

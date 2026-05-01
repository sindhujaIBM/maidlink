import { useState, useRef } from 'react';
import { getPhotoUploadUrl, uploadPhotoToS3, updateMaidProfile } from '../../api/users';
import { Spinner } from '../ui/Spinner';

interface PhotoUploadProps {
  currentPhotoUrl?: string | null;
  onUploaded: (s3Key: string) => void;
}

export function PhotoUpload({ currentPhotoUrl, onUploaded }: PhotoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(currentPhotoUrl || null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please select a JPEG or PNG image');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB');
      return;
    }

    setError(null);
    setIsUploading(true);

    // Show local preview immediately
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    try {
      // 1. Get pre-signed URL from our API
      const { uploadUrl, s3Key } = await getPhotoUploadUrl();

      // 2. Upload directly to S3
      await uploadPhotoToS3(uploadUrl, file);

      // 3. Save s3Key to profile
      await updateMaidProfile({ photoS3Key: s3Key });

      onUploaded(s3Key);
    } catch (err) {
      setError('Upload failed. Please try again.');
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      {/* Preview */}
      <div className="h-20 w-20 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
        {preview
          ? <img src={preview} alt="Profile" className="h-full w-full object-cover" />
          : <span className="text-gray-400 text-3xl">👤</span>
        }
      </div>

      {/* Upload button */}
      <div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={isUploading}
          className="btn-secondary text-sm inline-flex items-center gap-2"
        >
          {isUploading && <Spinner size="sm" />}
          {isUploading ? 'Uploading…' : 'Change Photo'}
        </button>
        <p className="mt-1 text-xs text-gray-500">JPEG or PNG, max 5 MB</p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
}

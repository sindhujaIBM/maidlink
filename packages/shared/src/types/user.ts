export type UserRole = 'CUSTOMER' | 'MAID' | 'ADMIN';
export type MaidStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface User {
  id: string;
  googleSub: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserRole_ {
  userId: string;
  role: UserRole;
  grantedAt: string;
}

export interface MaidProfile {
  id: string;
  userId: string;
  status: MaidStatus;
  bio: string | null;
  hourlyRate: string;          // NUMERIC comes back as string from pg
  serviceAreaCodes: string[];
  yearsExperience: number;
  photoS3Key: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaidWithUser extends MaidProfile {
  user: Pick<User, 'id' | 'email' | 'fullName' | 'avatarUrl'>;
  photoUrl?: string | null;    // Pre-signed S3 URL, populated at query time
}

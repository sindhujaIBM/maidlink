import { usersClient } from './client';

export interface MaidApplicationPayload {
  fullName: string;
  email: string;
  phone: string;
  gender: string;
  age: number;
  workEligibility: string;
  yearsExperience: number;
  bio?: string;
  hourlyRatePref?: number;
  hasOwnSupplies: boolean;
  canDrive: boolean;
  offersCooking: boolean;
  languages: string[];
  availability: string;
  photoS3Key?: string;
  idDocS3Key?: string;
  referralSource?: string;
}

export async function submitMaidApplication(payload: MaidApplicationPayload) {
  const { data } = await usersClient.post<{ id: string; submittedAt: string }>(
    '/users/maid-applications',
    payload
  );
  return data;
}

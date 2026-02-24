/** Standard API success envelope */
export interface ApiSuccess<T> {
  data: T;
}

/** Standard API error envelope */
export interface ApiError {
  error: {
    code: string;
    message: string;
    statusCode: number;
  };
}

/** JWT token payload stored inside the access token */
export interface JwtPayload {
  sub: string;           // users.id (UUID)
  email: string;
  roles: string[];       // e.g. ['CUSTOMER', 'MAID']
  maidStatus?: string;   // MaidStatus if the user has the MAID role
  maidProfileId?: string;
  iat: number;
  exp: number;
}

/** Decoded auth context injected into Lambda handlers by withAuth middleware */
export interface AuthContext {
  userId: string;
  email: string;
  roles: string[];
  maidStatus?: string;
  maidProfileId?: string;
}

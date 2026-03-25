import { describe, it, expect, beforeEach } from 'vitest';
import { signToken, verifyToken } from '../jwt';

describe('signToken', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
  });

  it('returns a 3-part JWT string', () => {
    const token = signToken({ sub: 'user-1', email: 'a@b.com', roles: ['CUSTOMER'] });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('throws when JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;
    expect(() => signToken({ sub: 'u', email: 'e@e.com', roles: [] }))
      .toThrow('JWT_SECRET environment variable is not set');
  });
});

describe('verifyToken', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
  });

  it('round-trips sub, email, and roles', () => {
    const token   = signToken({ sub: 'user-1', email: 'a@b.com', roles: ['CUSTOMER', 'MAID'] });
    const payload = verifyToken(`Bearer ${token}`);
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('a@b.com');
    expect(payload.roles).toEqual(['CUSTOMER', 'MAID']);
  });

  it('round-trips optional fields', () => {
    const token   = signToken({ sub: 'u', email: 'e@e.com', roles: ['MAID'], maidProfileId: 'mp-1', maidStatus: 'APPROVED' });
    const payload = verifyToken(`Bearer ${token}`);
    expect(payload.maidProfileId).toBe('mp-1');
    expect(payload.maidStatus).toBe('APPROVED');
  });

  it('throws on missing Authorization header', () => {
    expect(() => verifyToken(undefined)).toThrow('Missing or malformed Authorization header');
  });

  it('throws on header without Bearer prefix', () => {
    const token = signToken({ sub: 'u', email: 'e@e.com', roles: [] });
    expect(() => verifyToken(token)).toThrow('Missing or malformed Authorization header');
  });

  it('throws on tampered token', () => {
    const token   = signToken({ sub: 'u', email: 'e@e.com', roles: [] });
    const tampered = `${token.slice(0, -5)}XXXXX`;
    expect(() => verifyToken(`Bearer ${tampered}`)).toThrow('Invalid or expired token');
  });

  it('throws when signed with a different secret', () => {
    process.env.JWT_SECRET = 'secret-aaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const token = signToken({ sub: 'u', email: 'e@e.com', roles: [] });
    process.env.JWT_SECRET = 'secret-bbbbbbbbbbbbbbbbbbbbbbbbbbb';
    expect(() => verifyToken(`Bearer ${token}`)).toThrow('Invalid or expired token');
  });
});

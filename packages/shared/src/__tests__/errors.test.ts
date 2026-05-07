import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  toErrorResponse,
} from '../errors';

// ── Error class shapes ────────────────────────────────────────────────────────

describe('error classes', () => {
  it.each([
    [new NotFoundError(),        404, 'NOT_FOUND'],
    [new UnauthorizedError(),    401, 'UNAUTHORIZED'],
    [new ForbiddenError(),       403, 'FORBIDDEN'],
    [new ValidationError('bad'), 400, 'VALIDATION_ERROR'],
    [new ConflictError('clash'), 409, 'CONFLICT'],
  ] as [AppError, number, string][])(
    '%s has correct statusCode and code',
    (err, statusCode, code) => {
      expect(err.statusCode).toBe(statusCode);
      expect(err.code).toBe(code);
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
    }
  );

  it('preserves custom message', () => {
    expect(new NotFoundError('Booking not found').message).toBe('Booking not found');
    expect(new ValidationError('Rate must be positive').message).toBe('Rate must be positive');
  });

  it('uses default messages when none provided', () => {
    expect(new NotFoundError().message).toBe('Not found');
    expect(new UnauthorizedError().message).toBe('Unauthorized');
    expect(new ForbiddenError().message).toBe('Forbidden');
  });

  it('sets name to constructor name', () => {
    expect(new NotFoundError().name).toBe('NotFoundError');
    expect(new ValidationError('x').name).toBe('ValidationError');
  });
});

// ── toErrorResponse ───────────────────────────────────────────────────────────

describe('toErrorResponse', () => {
  it('formats an AppError into the correct envelope', () => {
    const res  = toErrorResponse(new NotFoundError('Maid not found'));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Maid not found');
    expect(body.error.statusCode).toBe(404);
  });

  it('includes CORS headers', () => {
    const res = toErrorResponse(new ValidationError('bad input'));
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://maidlink.ca');
    expect(res.headers['Content-Type']).toBe('application/json');
  });

  it('returns 500 for a plain Error', () => {
    const res  = toErrorResponse(new Error('boom'));
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('returns 500 for non-Error values', () => {
    expect(toErrorResponse('a string').statusCode).toBe(500);
    expect(toErrorResponse(null).statusCode).toBe(500);
    expect(toErrorResponse(42).statusCode).toBe(500);
  });

  it('formats ConflictError correctly', () => {
    const res  = toErrorResponse(new ConflictError('Time slot taken'));
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('Time slot taken');
  });
});

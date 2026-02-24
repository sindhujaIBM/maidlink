/** Base class for all application errors. */
export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

/** Formats any error into a Lambda-friendly API Gateway response body */
export function toErrorResponse(err: unknown): {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
} {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  };

  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      headers: corsHeaders,
      body: JSON.stringify({
        error: { code: err.code, message: err.message, statusCode: err.statusCode },
      }),
    };
  }

  console.error('Unhandled error:', err);
  return {
    statusCode: 500,
    headers: corsHeaders,
    body: JSON.stringify({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', statusCode: 500 },
    }),
  };
}

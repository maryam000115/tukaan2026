import { NextRequest, NextResponse } from 'next/server';

export interface ApiError {
  success: false;
  message: string;
  errors?: Record<string, string>;
  requestId?: string;
}

// Generate request ID for logging
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Format error response
export function formatErrorResponse(
  message: string,
  errors?: Record<string, string>,
  requestId?: string
): ApiError {
  return {
    success: false,
    message,
    errors,
    requestId,
  };
}

// Global error handler middleware
export function handleApiError(
  error: unknown,
  req?: NextRequest
): NextResponse<ApiError> {
  const requestId = generateRequestId();
  const isDevelopment = process.env.APP_ENV === 'development';

  // Log error server-side
  console.error(`[${requestId}] Error:`, error);

  // Handle MySQL errors
  if (error && typeof error === 'object' && 'code' in error) {
    const mysqlError = error as any;
    // MySQL duplicate entry error
    if (mysqlError.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        formatErrorResponse(
          'A record with this value already exists',
          undefined,
          requestId
        ),
        { status: 409 }
      );
    }
    // MySQL not found or other database errors
    if (mysqlError.code && mysqlError.code.startsWith('ER_')) {
      return NextResponse.json(
        formatErrorResponse(
          isDevelopment
            ? `Database error: ${mysqlError.message || mysqlError.sqlMessage}`
            : 'Database operation failed',
          undefined,
          requestId
        ),
        { status: 500 }
      );
    }
  }

  // Handle known API errors (with status code)
  if (error && typeof error === 'object' && 'status' in error) {
    const apiError = error as { status: number; message: string };
    return NextResponse.json(
      formatErrorResponse(
        apiError.message || 'An error occurred',
        undefined,
        requestId
      ),
      { status: apiError.status || 500 }
    );
  }

  // Handle validation errors
  if (error && typeof error === 'object' && 'errors' in error) {
    const validationError = error as { message: string; errors: Record<string, string> };
    return NextResponse.json(
      formatErrorResponse(validationError.message, validationError.errors, requestId),
      { status: 400 }
    );
  }

  // Handle generic errors
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : 'An unexpected error occurred';

  return NextResponse.json(
    formatErrorResponse(
      isDevelopment ? errorMessage : 'An unexpected error occurred. Please try again.',
      undefined,
      requestId
    ),
    { status: 500 }
  );
}

// Wrapper for API routes with error handling
export function withErrorHandling(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, context?: any) => {
    try {
      return await handler(req, context);
    } catch (error) {
      return handleApiError(error, req);
    }
  };
}


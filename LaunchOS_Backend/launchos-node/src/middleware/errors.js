// ═══════════════════════════════════════════════════════════
// LaunchOS™ — Error Handler & Response Helpers
// ═══════════════════════════════════════════════════════════

// ── Standard response helpers ──────────────────────────────
const ok = (res, data = {}, message = 'Success', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, ...data });

const fail = (res, message = 'An error occurred', statusCode = 400, errors = null) =>
  res.status(statusCode).json({ success: false, error: message, ...(errors && { errors }) });

// ── AppError class ─────────────────────────────────────────
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── Async wrapper — eliminates try/catch boilerplate ───────
const catchAsync = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ── Global error handler ───────────────────────────────────
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return fail(res, 'Validation failed', 422, errors);
  }
  // Duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return fail(res, `${field} already exists`, 409);
  }
  // JWT errors
  if (err.name === 'JsonWebTokenError')  return fail(res, 'Invalid token', 401);
  if (err.name === 'TokenExpiredError')  return fail(res, 'Token expired', 401);
  // Cast error (invalid MongoDB ID)
  if (err.name === 'CastError') return fail(res, `Invalid ${err.path}`, 400);

  // Operational errors (thrown by us)
  if (err.isOperational) return fail(res, err.message, err.statusCode);

  // Unknown — don't leak details in production
  if (process.env.NODE_ENV === 'production') {
    console.error('UNHANDLED ERROR:', err);
    return fail(res, 'Something went wrong', 500);
  }
  return fail(res, err.message, 500);
};

// ── Not found handler ──────────────────────────────────────
const notFound = (req, res) =>
  fail(res, `Route ${req.method} ${req.originalUrl} not found`, 404);

module.exports = { ok, fail, AppError, catchAsync, globalErrorHandler, notFound };

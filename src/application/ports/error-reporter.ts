/**
 * Where unexpected situations are reported. The console adapter is used until Sentry is connected;
 * a Sentry adapter implements the same interface (capture → Sentry.captureException with the
 * context as extras/tags, breadcrumb → Sentry.addBreadcrumb).
 */
export interface ErrorReporter {
  capture(error: unknown, context: Readonly<Record<string, unknown>>): void;
  breadcrumb(message: string, data?: Readonly<Record<string, unknown>>): void;
}

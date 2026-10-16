export type DataErrorCode = 'INVALID_DTO' | 'INVALID_URL' | 'HTTP_ERROR' | 'INVALID_JSON';

export class DataError extends Error {
  readonly code: DataErrorCode;

  constructor(code: DataErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DataError';
    this.code = code;
  }
}

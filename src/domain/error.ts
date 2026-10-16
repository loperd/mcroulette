export type DomainErrorCode =
  | 'INVALID_CASE_INSTANCE'
  | 'CASE_UNAVAILABLE'
  | 'INVALID_APPEARANCE'
  | 'INVALID_MODIFICATION_PROFILE'
  | 'INVALID_ITEM'
  | 'EMPTY_CATALOG'
  | 'DUPLICATE_ITEM'
  | 'INVALID_CAPACITY'
  | 'INVALID_RANDOM'
  | 'INVALID_STRIP'
  | 'INVALID_TARGET'
  | 'INVALID_SPIN';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

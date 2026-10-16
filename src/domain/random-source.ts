import { DomainError } from './error.ts';

export interface RandomSource {
  next(): number;
}

export function randomIndex(random: RandomSource, length: number): number {
  if (!Number.isSafeInteger(length) || length < 1) {
    throw new DomainError('INVALID_RANDOM', 'The random range must be a positive integer.');
  }
  return Math.floor(randomFraction(random) * length);
}

export function randomFraction(random: RandomSource): number {
  const value = random.next();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new DomainError('INVALID_RANDOM', 'Random values must belong to [0, 1).');
  }
  return value;
}

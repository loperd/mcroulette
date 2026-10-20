import { DomainError } from './error.ts';
import { randomFraction, type RandomSource } from './random-source.ts';
import { assertTarget, type TargetSelection } from './strip.ts';

export interface SpinSettings {
  /** Deceleration in slot strides per second squared (legacy: 500 px / 155 px). */
  readonly deceleration: number;
  readonly nominalTimeSeconds: number;
  readonly timeScale: number;
  /** Card width divided by the stride, excluding the gap. */
  readonly cardFraction: number;
}

export const DEFAULT_SPIN_SETTINGS: SpinSettings = Object.freeze({
  deceleration: 500 / 155,
  nominalTimeSeconds: 5,
  timeScale: 1.2,
  cardFraction: 184 / 200,
});

export interface SpinPlan {
  readonly slotCount: number;
  readonly targetIndex: number;
  readonly fullTurns: number;
  readonly targetOffsetFraction: number;
  readonly startPosition: number;
  readonly endPosition: number;
  readonly distance: number;
  readonly durationSeconds: number;
  readonly deceleration: number;
  readonly timeScale: number;
}

export function createSpinPlan(
  selection: TargetSelection,
  random: RandomSource,
  settings: SpinSettings = DEFAULT_SPIN_SETTINGS,
  startPosition = 0,
): SpinPlan {
  assertTarget(selection);
  assertSpinSettings(settings);
  if (!Number.isFinite(startPosition) || startPosition < 0) {
    throw new DomainError('INVALID_SPIN', 'The start position must be finite and nonnegative.');
  }

  const slotCount = selection.slots.length;
  const targetOffsetFraction = randomFraction(random) * 0.8 - 0.4;
  const landing = selection.targetIndex + 0.5 + targetOffsetFraction * settings.cardFraction;
  const delta = ((landing - startPosition % slotCount) % slotCount + slotCount) % slotCount;
  const minimumDistance = settings.deceleration * settings.nominalTimeSeconds ** 2 / 2;
  const fullTurns = Math.ceil(minimumDistance / slotCount);
  const distance = fullTurns * slotCount + delta;
  const durationSeconds = Math.sqrt(2 * distance / settings.deceleration) * settings.timeScale;
  const endPosition = startPosition + distance;
  if (![distance, durationSeconds, endPosition].every(Number.isFinite)
      || !Number.isSafeInteger(fullTurns) || distance <= 0 || durationSeconds <= 0) {
    throw new DomainError('INVALID_SPIN', 'The configured spin exceeds the supported numeric range.');
  }

  return Object.freeze({
    slotCount,
    targetIndex: selection.targetIndex,
    fullTurns,
    targetOffsetFraction,
    startPosition,
    endPosition,
    distance,
    durationSeconds,
    deceleration: settings.deceleration,
    timeScale: settings.timeScale,
  });
}

export function positionAt(plan: SpinPlan, elapsedSeconds: number): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new DomainError('INVALID_SPIN', 'Elapsed time must be finite and nonnegative.');
  }
  if (elapsedSeconds >= plan.durationSeconds) return plan.endPosition;
  const time = elapsedSeconds / plan.timeScale;
  const initialVelocity = Math.sqrt(2 * plan.deceleration * plan.distance);
  return plan.startPosition + initialVelocity * time - plan.deceleration * time ** 2 / 2;
}

export function assertSpinSettings(settings: SpinSettings): void {
  if (![settings.deceleration, settings.nominalTimeSeconds, settings.timeScale, settings.cardFraction]
    .every(value => Number.isFinite(value) && value > 0) || settings.cardFraction > 1) {
    throw new DomainError('INVALID_SPIN', 'Spin settings must be positive and card fraction at most one.');
  }
}

import type { SpinPlan } from '../../domain/spin-plan.ts';
import type { TargetSelection } from '../../domain/strip.ts';

export interface RoulettePresentationPort {
  prepare(signal: AbortSignal): Promise<void>;
  prepareSpin?(selection: TargetSelection, signal: AbortSignal): Promise<void>;
  spin(selection: TargetSelection, plan: SpinPlan, signal: AbortSignal): Promise<void>;
  reset(): void;
  dispose(): void;
}

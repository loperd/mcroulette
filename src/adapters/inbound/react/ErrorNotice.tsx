import type { ReactNode } from 'react';

/**
 * Every error the player can see looks the same: a small card on the world surface with a
 * warning mark, what failed, what to do, and the way out. The failsafe modal (plain DOM, outside
 * React) builds the same markup with the same classes.
 */
export function ErrorNotice({ eyebrow = 'Что-то пошло не так', title, children, actions, compact = false }: {
  readonly eyebrow?: string; readonly title: string; readonly children?: ReactNode; readonly actions?: ReactNode; readonly compact?: boolean;
}) {
  return (
    <section className={`error-notice${compact ? ' error-notice--compact' : ''}`} role="alert">
      <div className="error-notice__panel">
        <span className="error-notice__mark" aria-hidden="true">!</span>
        <p className="error-notice__eyebrow">{eyebrow}</p>
        <h2 className="error-notice__title">{title}</h2>
        {children && <div className="error-notice__text">{children}</div>}
        {actions && <div className="error-notice__actions">{actions}</div>}
      </div>
    </section>
  );
}

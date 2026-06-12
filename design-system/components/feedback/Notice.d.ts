import * as React from 'react';

export interface NoticeProps extends React.HTMLAttributes<HTMLParagraphElement> {
  /**
   * `default` (sunken box), `muted` (bare quiet line — stale/last-updated),
   * `error` (red), `urgent` (amber).
   */
  variant?: 'default' | 'muted' | 'error' | 'urgent';
  /** Leading icon element. */
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

/** Inline message line — info, error, urgent, or the quiet muted footnote. */
export function Notice(props: NoticeProps): JSX.Element;

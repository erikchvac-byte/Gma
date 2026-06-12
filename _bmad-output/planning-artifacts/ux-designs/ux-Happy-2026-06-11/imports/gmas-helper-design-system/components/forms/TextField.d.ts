import * as React from 'react';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Visible label (associated via htmlFor). */
  label?: React.ReactNode;
  /** Helper text shown below when there's no error. */
  hint?: React.ReactNode;
  /** Error message; also sets aria-invalid + red border. */
  error?: React.ReactNode;
  /** Monospace numerals for numeric entry (e.g. vehicle MPG). */
  mono?: boolean;
}

/** Labelled text input with hint / error states. */
export function TextField(props: TextFieldProps): JSX.Element;

import * as React from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Visible label (associated via htmlFor). */
  label?: React.ReactNode;
  /** Convenience options; or pass <option> children instead. */
  options?: SelectOption[];
  /** Disabled leading placeholder option. */
  placeholder?: string;
}

/** Native select with brand chrome — used for year/make/model precision mode. */
export function Select(props: SelectProps): JSX.Element;

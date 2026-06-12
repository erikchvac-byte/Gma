import * as React from 'react';

export interface RangeSliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  /** Label shown above the track. */
  label?: React.ReactNode;
  /** Controlled numeric value. */
  value: number;
  /** Receives the new numeric value. */
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Override the displayed value (e.g. "25 miles"). */
  valueText?: React.ReactNode;
  /** Show min/max tick labels below the track. */
  showTicks?: boolean;
  minLabel?: React.ReactNode;
  maxLabel?: React.ReactNode;
}

/**
 * Labelled range slider — the distance filter, generalized.
 *
 * @startingPoint section="Forms" subtitle="The distance filter slider" viewport="700x140"
 */
export function RangeSlider(props: RangeSliderProps): JSX.Element;

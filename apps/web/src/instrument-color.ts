import type { CSSProperties } from 'react';

import type { InstrumentReference } from './api';

interface InstrumentColor {
  background: string;
  foreground: string;
}

const BRAND_COLORS: Record<string, InstrumentColor> = {
  AAPL: { background: '#4b5563', foreground: '#ffffff' },
  AMZN: { background: '#ff9900', foreground: '#1f2937' },
  GOOGL: { background: '#4285f4', foreground: '#ffffff' },
  GOOG: { background: '#4285f4', foreground: '#ffffff' },
  META: { background: '#0866ff', foreground: '#ffffff' },
  MSFT: { background: '#107c10', foreground: '#ffffff' },
  NFLX: { background: '#e50914', foreground: '#ffffff' },
  NVDA: { background: '#76b900', foreground: '#172b00' },
  SNDK: { background: '#e31837', foreground: '#ffffff' },
  TSLA: { background: '#cc0000', foreground: '#ffffff' },
};

const FALLBACK_COLORS: InstrumentColor[] = [
  { background: '#1967d2', foreground: '#ffffff' },
  { background: '#00897b', foreground: '#ffffff' },
  { background: '#7b1fa2', foreground: '#ffffff' },
  { background: '#c45a00', foreground: '#ffffff' },
  { background: '#5f6368', foreground: '#ffffff' },
  { background: '#0086c9', foreground: '#ffffff' },
];

export function instrumentColor(instrument: Pick<InstrumentReference, 'symbol'>): InstrumentColor {
  const symbol = instrument.symbol.toUpperCase();
  const brandedColor = BRAND_COLORS[symbol];

  if (brandedColor !== undefined) {
    return brandedColor;
  }

  const hash = [...symbol].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]!;
}

export function instrumentColorStyle(instrument: Pick<InstrumentReference, 'symbol'>): CSSProperties {
  const color = instrumentColor(instrument);

  return {
    '--instrument-color': color.background,
    '--instrument-color-foreground': color.foreground,
  } as CSSProperties;
}

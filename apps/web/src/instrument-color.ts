import { type CSSProperties, useEffect, useState } from 'react';

import { api, type BrandColor, type CachedResult, type InstrumentReference } from './api';

interface InstrumentColor {
  background: string;
  foreground: string;
}

const DEFAULT_COLOR: InstrumentColor = { background: '#3c4043', foreground: '#ffffff' };

const colorCache = new Map<string, InstrumentColor>();
const colorRequests = new Map<string, Promise<InstrumentColor>>();

function fetchInstrumentColor(symbol: string): Promise<InstrumentColor> {
  const cached = colorCache.get(symbol);

  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  const inflight = colorRequests.get(symbol);

  if (inflight !== undefined) {
    return inflight;
  }

  const request = api<CachedResult<BrandColor>>(`/api/market/brand-color?symbol=${encodeURIComponent(symbol)}`)
    .then((result): InstrumentColor => ({ background: result.data.background, foreground: result.data.foreground }))
    .catch(() => DEFAULT_COLOR)
    .then((color) => {
      colorCache.set(symbol, color);
      colorRequests.delete(symbol);

      return color;
    });

  colorRequests.set(symbol, request);

  return request;
}

export function useInstrumentColor(instrument: Pick<InstrumentReference, 'symbol'>): InstrumentColor {
  const symbol = instrument.symbol.toUpperCase();
  const [color, setColor] = useState<InstrumentColor>(() => colorCache.get(symbol) ?? DEFAULT_COLOR);

  useEffect(() => {
    let cancelled = false;
    setColor(colorCache.get(symbol) ?? DEFAULT_COLOR);

    void fetchInstrumentColor(symbol).then((resolvedColor) => {
      if (!cancelled) {
        setColor(resolvedColor);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return color;
}

export function useInstrumentColorStyle(instrument: Pick<InstrumentReference, 'symbol'>): CSSProperties {
  const color = useInstrumentColor(instrument);

  return {
    '--instrument-color': color.background,
    '--instrument-color-foreground': color.foreground,
  } as CSSProperties;
}

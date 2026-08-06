import type { BrandColor } from '../domain/market.js';

const HEX_PATTERN = /^#([0-9a-f]{6})$/i;
const DARK_FOREGROUND = '#1f2937';
const LIGHT_FOREGROUND = '#ffffff';
const BRIGHTNESS_THRESHOLD = 140;

export const DEFAULT_BRAND_COLOR: BrandColor = {
  background: '#3c4043',
  foreground: LIGHT_FOREGROUND,
};

export function brandColorFromHex(hex: string): BrandColor {
  const match = HEX_PATTERN.exec(hex);

  if (match === null) {
    return DEFAULT_BRAND_COLOR;
  }

  const value = match[1]!;
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  const brightness = ((red * 299) + (green * 587) + (blue * 114)) / 1000;

  return {
    background: `#${value.toLowerCase()}`,
    foreground: brightness > BRIGHTNESS_THRESHOLD ? DARK_FOREGROUND : LIGHT_FOREGROUND,
  };
}

export function resolveDomain(website: string | null): string | null {
  if (website === null) {
    return null;
  }

  try {
    return new URL(website).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

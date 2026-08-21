import type { LabColorV2 } from "./observation";

const D65 = { x: 0.95047, y: 1, z: 1.08883 } as const;

function round(value: number, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function median(values: readonly number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function trimmedMean(values: readonly number[], ratio = 0.1) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const trim = Math.min(Math.floor(ordered.length * ratio), Math.floor((ordered.length - 1) / 2));
  const kept = ordered.slice(trim, ordered.length - trim);
  return kept.reduce((sum, value) => sum + value, 0) / kept.length;
}

export function srgbChannelToLinearV2(channel: number) {
  const normalized = Math.max(0, Math.min(255, channel)) / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function rgbToLabD65V2(red: number, green: number, blue: number): LabColorV2 {
  const r = srgbChannelToLinearV2(red);
  const g = srgbChannelToLinearV2(green);
  const b = srgbChannelToLinearV2(blue);
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;
  const transform = (value: number) => value > 216 / 24389
    ? Math.cbrt(value)
    : (24389 / 27 * value + 16) / 116;
  const fx = transform(x / D65.x);
  const fy = transform(y / D65.y);
  const fz = transform(z / D65.z);
  return { l: round(116 * fy - 16), a: round(500 * (fx - fy)), b: round(200 * (fy - fz)) };
}

export function deltaE76V2(first: LabColorV2, second: LabColorV2) {
  return round(Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b));
}

export function robustLabStatisticsV2(values: readonly LabColorV2[]) {
  const channels = {
    l: values.map((value) => value.l),
    a: values.map((value) => value.a),
    b: values.map((value) => value.b),
  };
  const center = { l: median(channels.l), a: median(channels.a), b: median(channels.b) };
  const chroma = values.map((value) => Math.hypot(value.a, value.b));
  const hues = values.map((value) => (Math.atan2(value.b, value.a) * 180 / Math.PI + 360) % 360);
  return {
    median: { l: round(center.l), a: round(center.a), b: round(center.b) },
    trimmedMean: {
      l: round(trimmedMean(channels.l)),
      a: round(trimmedMean(channels.a)),
      b: round(trimmedMean(channels.b)),
    },
    mad: {
      l: round(median(channels.l.map((value) => Math.abs(value - center.l)))),
      a: round(median(channels.a.map((value) => Math.abs(value - center.a)))),
      b: round(median(channels.b.map((value) => Math.abs(value - center.b)))),
    },
    chromaMedian: round(median(chroma)),
    hueDegreesMedian: round(median(hues)),
  };
}

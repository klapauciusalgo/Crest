import type { Regime4h, Timeframe, TradeRecommendation30m } from "@/lib/mock-data";
import type { OhlcvCandle } from "@/lib/market/types";

export function calculateSma(values: number[], length: number) {
  const window = values.slice(-length);
  if (window.length === 0) return 0;
  return round(window.reduce((sum, value) => sum + value, 0) / window.length);
}

export function calculateRsi(values: number[], length = 14) {
  if (values.length <= length) return 50;

  const deltas = values.slice(1).map((value, index) => value - values[index]);
  const recent = deltas.slice(-length);
  const gains = recent.map((value) => Math.max(value, 0));
  const losses = recent.map((value) => Math.abs(Math.min(value, 0)));
  const averageGain = gains.reduce((sum, value) => sum + value, 0) / length;
  const averageLoss = losses.reduce((sum, value) => sum + value, 0) / length;

  if (averageLoss === 0) return 100;

  const relativeStrength = averageGain / averageLoss;
  return round(100 - 100 / (1 + relativeStrength));
}

export function getRegime4hFromValues(price: number, ma111: number, rsi14: number): Regime4h {
  if (price > ma111 && rsi14 > 55) return "Bullish";
  if (price < ma111 && rsi14 < 50) return "Bearish";
  return "Neutral";
}

export function getRecommendation30mFromValues(rsi30m: number, regime4h: Regime4h): TradeRecommendation30m {
  if (regime4h === "Bullish" && rsi30m < 35) return "Long/Buy";
  if (regime4h === "Bearish" && rsi30m > 70) return "Short/Sell";
  return "Wait";
}

export function deriveIndicatorValues(candles: OhlcvCandle[], timeframe: Timeframe) {
  const sorted = [...candles].sort((first, second) => first.openTime.localeCompare(second.openTime));
  const closes = sorted.map((candle) => candle.close);
  const latest = sorted[sorted.length - 1];
  const prior = sorted[Math.max(0, sorted.length - 49)];
  const price = latest?.close || 0;
  const rsi14 = calculateRsi(closes);
  const ma111 = calculateSma(closes, 111);
  const maDistancePct = ma111 === 0 ? 0 : round(((price - ma111) / ma111) * 100);
  const priceChange24h = prior?.close ? round(((price - prior.close) / prior.close) * 100) : 0;
  const volumeChange24h = timeframe === "30m" ? estimateVolumeChange(sorted, 48) : estimateVolumeChange(sorted, 6);

  return {
    price,
    priceChange24h,
    volumeChange24h,
    rsi14,
    ma111,
    maDistancePct
  };
}

function estimateVolumeChange(candles: OhlcvCandle[], lookback: number) {
  const recent = candles.slice(-lookback);
  const previous = candles.slice(-lookback * 2, -lookback);
  const recentVolume = recent.reduce((sum, candle) => sum + candle.volume, 0);
  const previousVolume = previous.reduce((sum, candle) => sum + candle.volume, 0);
  if (previousVolume === 0) return 0;
  return round(((recentVolume - previousVolume) / previousVolume) * 100);
}

export function round(value: number) {
  return Math.round(value * 100) / 100;
}

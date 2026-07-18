import type { Regime4h, Timeframe, TradeRecommendation30m } from "@/lib/mock-data";
import type { OhlcvCandle } from "@/lib/market/types";

const correlationWindowReturns = 60;
const minimumPairedCorrelationReturns = 30;

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

export function getBtcGatedRecommendation30mFromValues(
  rsi30m: number,
  btcRegime4h: Regime4h
): TradeRecommendation30m {
  if (btcRegime4h === "Bullish" && rsi30m < 35) return "Long/Buy";
  if (btcRegime4h === "Bearish" && rsi30m > 70) return "Short/Sell";
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

export function calculateBtcCorrelationScore(
  assetCandles: OhlcvCandle[],
  btcCandles: OhlcvCandle[],
  windowReturns = correlationWindowReturns
) {
  if (assetCandles.length < 2 || btcCandles.length < 2) return null;

  const btcReturnsByCloseTime = new Map(buildReturnsByCloseTime(btcCandles).map((item) => [item.closeTime, item.value]));
  const pairedReturns = buildReturnsByCloseTime(assetCandles)
    .map((assetReturn) => {
      const btcReturn = btcReturnsByCloseTime.get(assetReturn.closeTime);
      if (btcReturn === undefined) return null;
      return [assetReturn.value, btcReturn] as const;
    })
    .filter((pair): pair is readonly [number, number] => Boolean(pair))
    .slice(-windowReturns);

  if (pairedReturns.length < minimumPairedCorrelationReturns) return null;

  const assetValues = pairedReturns.map(([assetReturn]) => assetReturn);
  const btcValues = pairedReturns.map(([, btcReturn]) => btcReturn);
  const coefficient = pearson(assetValues, btcValues);
  if (coefficient === null) return null;

  return round(coefficient * 100);
}

function estimateVolumeChange(candles: OhlcvCandle[], lookback: number) {
  const recent = candles.slice(-lookback);
  const previous = candles.slice(-lookback * 2, -lookback);
  const recentVolume = recent.reduce((sum, candle) => sum + candle.volume, 0);
  const previousVolume = previous.reduce((sum, candle) => sum + candle.volume, 0);
  if (previousVolume === 0) return 0;
  return round(((recentVolume - previousVolume) / previousVolume) * 100);
}

function buildReturnsByCloseTime(candles: OhlcvCandle[]) {
  const sorted = [...candles].sort((first, second) => first.openTime.localeCompare(second.openTime));
  return sorted.slice(1).map((candle, index) => {
    const priorClose = sorted[index].close;
    const value = priorClose > 0 && candle.close > 0 ? Math.log(candle.close / priorClose) : 0;
    return {
      closeTime: candle.closeTime,
      value
    };
  });
}

function pearson(firstValues: number[], secondValues: number[]) {
  if (firstValues.length !== secondValues.length || firstValues.length === 0) return null;

  const firstAverage = firstValues.reduce((sum, value) => sum + value, 0) / firstValues.length;
  const secondAverage = secondValues.reduce((sum, value) => sum + value, 0) / secondValues.length;
  let numerator = 0;
  let firstVariance = 0;
  let secondVariance = 0;

  for (let index = 0; index < firstValues.length; index += 1) {
    const firstDelta = firstValues[index] - firstAverage;
    const secondDelta = secondValues[index] - secondAverage;
    numerator += firstDelta * secondDelta;
    firstVariance += firstDelta ** 2;
    secondVariance += secondDelta ** 2;
  }

  const denominator = Math.sqrt(firstVariance * secondVariance);
  if (denominator === 0) return null;

  return numerator / denominator;
}

export function round(value: number) {
  return Math.round(value * 100) / 100;
}

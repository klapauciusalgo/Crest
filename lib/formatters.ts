export function formatPrice(price: number) {
  if (price >= 1000) {
    return `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }

  if (price >= 1) {
    return `$${price.toFixed(2)}`;
  }

  return `$${price.toFixed(4)}`;
}

export function formatPct(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

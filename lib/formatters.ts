export function formatPrice(price: number) {
  if (!Number.isFinite(price)) return "$0.00";
  if (price <= 0) return "$0.00";

  if (price >= 1000) {
    return `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }

  if (price >= 1) {
    return `$${price.toFixed(2)}`;
  }

  if (price >= 0.01) {
    return `$${price.toFixed(4)}`;
  }

  if (price >= 0.00001) {
    return `$${price.toFixed(6)}`;
  }

  if (price > 0) {
    if (price < 0.00000001) return "<$0.00000001";
    return `$${price.toFixed(8)}`;
  }

  return "$0.00";
}

export function formatPct(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatCompactDollar(value: number) {
  return `$${Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value)}`;
}

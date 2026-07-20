"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import type { TradingVenueAvailability } from "@/lib/market/venue-types";

export function VenueBadges({ venues }: { venues: TradingVenueAvailability[] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, above: false });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(300, window.innerWidth - 24);
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
      const above = rect.bottom + 190 > window.innerHeight;
      setPosition({ left, top: above ? rect.top - 6 : rect.bottom + 6, above });
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) setOpen(false);
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [open]);

  if (venues.length === 0) return null;

  return (
    <div className="venue-badges" onMouseLeave={() => setOpen(false)}>
      <button
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        aria-label={`Available on ${venues.map(formatVenueSummary).join(", ")}`}
        className="venue-badge-trigger"
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onMouseEnter={() => setOpen(true)}
        ref={triggerRef}
        title={venues.map(formatVenueSummary).join(" · ")}
        type="button"
      >
        {venues.map((venue) => (
          <span className={`venue-chip ${venue.isStale ? "stale" : ""}`} key={venue.venue}>
            <b>{venue.venue === "binance" ? "BN" : "HL"}</b>
            <small>{formatMarketTypes(venue)}</small>
          </span>
        ))}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className={`venue-popover ${position.above ? "above" : ""}`}
              id={tooltipId}
              role="tooltip"
              style={{ left: position.left, top: position.top }}
            >
              <VenuePopoverContent venues={venues} />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export function VenueMarketList({ venues }: { venues: TradingVenueAvailability[] }) {
  if (venues.length === 0) return <p className="venue-empty">Venue availability pending.</p>;

  return (
    <div className="venue-market-list" aria-label="Available trading markets">
      <span className="venue-market-label">Available markets</span>
      <div>
        {venues.flatMap((venue) =>
          venue.markets.map((market) => (
            <span className={`venue-market-item ${venue.isStale ? "stale" : ""}`} key={`${venue.venue}-${market.marketType}-${market.marketSymbol}`}>
              <b>{formatVenueName(venue.venue)}</b>
              <span>{formatMarketType(market.marketType)}</span>
              <code>{market.marketSymbol}</code>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function VenuePopoverContent({ venues }: { venues: TradingVenueAvailability[] }) {
  return (
    <>
      <div className="venue-popover-head">
        <strong>Available markets</strong>
        <span>{venues.some((venue) => venue.isStale) ? "Verification delayed" : "Verified"}</span>
      </div>
      <div className="venue-popover-list">
        {venues.flatMap((venue) =>
          venue.markets.map((market) => (
            <div key={`${venue.venue}-${market.marketType}-${market.marketSymbol}`}>
              <span>{formatVenueName(venue.venue)}</span>
              <b>{formatMarketType(market.marketType)}</b>
              <code>{market.marketSymbol}</code>
            </div>
          ))
        )}
      </div>
      <p>
        {venues.some((venue) => venue.isStale) ? "Last verified " : "Checked "}
        {formatCheckedAt(getLatestCheckedAt(venues))}
      </p>
    </>
  );
}

function formatVenueSummary(venue: TradingVenueAvailability) {
  return `${formatVenueName(venue.venue)} ${formatMarketTypes(venue)}`;
}

function formatVenueName(venue: TradingVenueAvailability["venue"]) {
  return venue === "binance" ? "Binance" : "Hyperliquid";
}

function formatMarketTypes(venue: TradingVenueAvailability) {
  const types = new Set(venue.markets.map((market) => market.marketType));
  if (types.has("spot") && types.has("perp")) return "S/P";
  return types.has("perp") ? "P" : "S";
}

function formatMarketType(marketType: TradingVenueAvailability["markets"][number]["marketType"]) {
  return marketType === "perp" ? "Perpetual" : "Spot";
}

function getLatestCheckedAt(venues: TradingVenueAvailability[]) {
  return venues.reduce((latest, venue) => {
    if (!latest || new Date(venue.lastCheckedAt).getTime() > new Date(latest).getTime()) return venue.lastCheckedAt;
    return latest;
  }, "");
}

function formatCheckedAt(value: string) {
  if (!value) return "unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
    timeZoneName: "short"
  }).format(new Date(value));
}

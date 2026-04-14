export type MarketPhase =
  | "trading"
  | "lunch_break"
  | "pre_open"
  | "closed"
  | "weekend";

export function getMarketPhase(now: Date): MarketPhase;
export function isTradingSession(now: Date): boolean;
export function getNextMarketBoundary(now: Date): Date;

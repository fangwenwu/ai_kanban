import test from "node:test";
import assert from "node:assert/strict";

import {
  getMarketPhase,
  getNextMarketBoundary,
  isTradingSession,
} from "./market-session.js";

function createDate(value) {
  return new Date(`${value}+08:00`);
}

test("isTradingSession returns true only during A-share continuous trading windows", () => {
  assert.equal(isTradingSession(createDate("2026-04-14T09:30:00")), true);
  assert.equal(isTradingSession(createDate("2026-04-14T11:29:59")), true);
  assert.equal(isTradingSession(createDate("2026-04-14T13:00:00")), true);
  assert.equal(isTradingSession(createDate("2026-04-14T14:59:59")), true);

  assert.equal(isTradingSession(createDate("2026-04-14T09:29:59")), false);
  assert.equal(isTradingSession(createDate("2026-04-14T11:30:00")), false);
  assert.equal(isTradingSession(createDate("2026-04-14T12:30:00")), false);
  assert.equal(isTradingSession(createDate("2026-04-14T15:00:00")), false);
  assert.equal(isTradingSession(createDate("2026-04-18T10:00:00")), false);
});

test("getMarketPhase distinguishes pre-open, lunch break, closed and weekend", () => {
  assert.equal(getMarketPhase(createDate("2026-04-14T09:00:00")), "pre_open");
  assert.equal(getMarketPhase(createDate("2026-04-14T10:00:00")), "trading");
  assert.equal(
    getMarketPhase(createDate("2026-04-14T12:00:00")),
    "lunch_break",
  );
  assert.equal(getMarketPhase(createDate("2026-04-14T15:30:00")), "closed");
  assert.equal(getMarketPhase(createDate("2026-04-18T10:00:00")), "weekend");
});

test("getNextMarketBoundary returns the next trading boundary across lunch, close and weekend", () => {
  assert.equal(
    getNextMarketBoundary(createDate("2026-04-14T09:00:00")).toISOString(),
    createDate("2026-04-14T09:30:00").toISOString(),
  );
  assert.equal(
    getNextMarketBoundary(createDate("2026-04-14T10:00:00")).toISOString(),
    createDate("2026-04-14T11:30:00").toISOString(),
  );
  assert.equal(
    getNextMarketBoundary(createDate("2026-04-14T12:00:00")).toISOString(),
    createDate("2026-04-14T13:00:00").toISOString(),
  );
  assert.equal(
    getNextMarketBoundary(createDate("2026-04-14T14:00:00")).toISOString(),
    createDate("2026-04-14T15:00:00").toISOString(),
  );
  assert.equal(
    getNextMarketBoundary(createDate("2026-04-14T15:30:00")).toISOString(),
    createDate("2026-04-15T09:30:00").toISOString(),
  );
  assert.equal(
    getNextMarketBoundary(createDate("2026-04-18T10:00:00")).toISOString(),
    createDate("2026-04-20T09:30:00").toISOString(),
  );
});

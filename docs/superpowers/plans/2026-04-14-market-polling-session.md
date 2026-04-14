# Market Polling Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop automatic quote and analysis polling outside A-share trading sessions, then automatically resume when the next valid session begins while preserving manual refresh and existing request-race protections.

**Architecture:** Keep the implementation inside `src/App.vue` for the smallest possible diff. Add explicit market-session state, centralize timer lifecycle management, and schedule a single boundary timeout that re-evaluates market phase at `11:30`, `13:00`, `15:00`, and the next workday `09:30` so polling never free-runs after close and never gets stuck stopped on the next session.

**Tech Stack:** Vue 3, TypeScript, browser timers, existing Fetch API + AbortController flow, Vite

---

## File Map

- Modify: `src/App.vue`
  - Own market phase calculation, polling timer lifecycle, boundary scheduling, and hero status text.
- Verify: `docs/superpowers/specs/2026-04-14-market-polling-session-design.md`
  - Keep implementation aligned with the approved session rules and boundary behavior.

### Task 1: Add explicit market-session state and timer lifecycle guards

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: Add market phase types, state refs, and timer refs near the existing reactive state**

```ts
type MarketPhase =
  | "trading"
  | "lunch_break"
  | "pre_open"
  | "closed"
  | "weekend";

const marketPhase = ref<MarketPhase>("pre_open");

let marketBoundaryTimer: number | null = null;
let quoteRefreshTimer: number | null = null;
let analysisRefreshTimer: number | null = null;
```

- [ ] **Step 2: Add pure market-session helper functions above the fetch functions**

```ts
function isWeekend(day: number) {
  return day === 0 || day === 6;
}

function withTime(base: Date, hours: number, minutes: number, seconds = 0) {
  const next = new Date(base);
  next.setHours(hours, minutes, seconds, 0);
  return next;
}

function getNextWeekdayMorning(base: Date) {
  const next = new Date(base);
  next.setDate(next.getDate() + 1);

  while (isWeekend(next.getDay())) {
    next.setDate(next.getDate() + 1);
  }

  return withTime(next, 9, 30);
}

function getMarketPhase(now: Date) {
  if (isWeekend(now.getDay())) {
    return "weekend" as const;
  }

  const current = now.getHours() * 60 + now.getMinutes();
  const morningOpen = 9 * 60 + 30;
  const morningClose = 11 * 60 + 30;
  const afternoonOpen = 13 * 60;
  const afternoonClose = 15 * 60;

  if (current < morningOpen) {
    return "pre_open" as const;
  }

  if (current < morningClose) {
    return "trading" as const;
  }

  if (current < afternoonOpen) {
    return "lunch_break" as const;
  }

  if (current < afternoonClose) {
    return "trading" as const;
  }

  return "closed" as const;
}

function isTradingSession(now: Date) {
  return getMarketPhase(now) === "trading";
}

function getNextMarketBoundary(now: Date) {
  const phase = getMarketPhase(now);

  if (phase === "weekend") {
    return getNextWeekdayMorning(now);
  }

  if (phase === "pre_open") {
    return withTime(now, 9, 30);
  }

  if (phase === "lunch_break") {
    return withTime(now, 13, 0);
  }

  if (phase === "trading") {
    const current = now.getHours() * 60 + now.getMinutes();
    return current < 11 * 60 + 30 ? withTime(now, 11, 30) : withTime(now, 15, 0);
  }

  return getNextWeekdayMorning(now);
}
```

- [ ] **Step 3: Add centralized timer cleanup helpers so repeated state changes remain idempotent**

```ts
function clearQuoteRefreshTimer() {
  if (quoteRefreshTimer !== null) {
    window.clearInterval(quoteRefreshTimer);
    quoteRefreshTimer = null;
  }
}

function clearAnalysisRefreshTimer() {
  if (analysisRefreshTimer !== null) {
    window.clearInterval(analysisRefreshTimer);
    analysisRefreshTimer = null;
  }
}

function clearMarketBoundaryTimer() {
  if (marketBoundaryTimer !== null) {
    window.clearTimeout(marketBoundaryTimer);
    marketBoundaryTimer = null;
  }
}

function stopPolling() {
  clearQuoteRefreshTimer();
  clearAnalysisRefreshTimer();
}
```

- [ ] **Step 4: Add guarded polling startup that refuses to create duplicate intervals**

```ts
function startPolling() {
  if (!activeSymbol.value) {
    return;
  }

  if (quoteRefreshTimer === null) {
    quoteRefreshTimer = window.setInterval(() => {
      void fetchQuote();
    }, 5000);
  }

  if (analysisRefreshTimer === null) {
    analysisRefreshTimer = window.setInterval(() => {
      void fetchAnalysis();
    }, 30000);
  }
}
```

- [ ] **Step 5: Add market-boundary scheduling so the page can stop and resume without reload**

```ts
function scheduleNextMarketBoundaryCheck() {
  clearMarketBoundaryTimer();

  const now = new Date();
  const nextBoundary = getNextMarketBoundary(now);
  const delay = Math.max(500, nextBoundary.getTime() - now.getTime() + 500);

  marketBoundaryTimer = window.setTimeout(() => {
    syncPollingByMarketPhase();
  }, delay);
}

function syncPollingByMarketPhase() {
  const now = new Date();
  marketPhase.value = getMarketPhase(now);

  if (isTradingSession(now) && activeSymbol.value) {
    startPolling();
  } else {
    stopPolling();
  }

  scheduleNextMarketBoundaryCheck();
}
```

- [ ] **Step 6: Run the type check build to confirm the new helpers compile**

Run: `npm run build`
Expected: `vue-tsc` and `vite build` both succeed without new TypeScript errors

- [ ] **Step 7: Commit the timer lifecycle foundation**

```bash
git add src/App.vue
git commit -m "feat: add market session polling guards"
```

### Task 2: Wire session state into fetch flow, watchers, and lifecycle hooks

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: Keep one-shot loading on page entry and symbol switch, but leave recurring polling to the session controller**

```ts
watch(activeSymbol, () => {
  stopPolling();

  if (!activeSymbol.value) {
    clearDashboardState();
    syncPollingByMarketPhase();
    return;
  }

  void fetchQuote({ reset: true });
  void fetchAnalysis({ reset: true });
  syncPollingByMarketPhase();
});
```

- [ ] **Step 2: Replace the current `onMounted` interval bootstrapping with session-aware startup**

```ts
onMounted(() => {
  void fetchInstruments();

  if (activeSymbol.value) {
    void fetchQuote({ reset: true });
    void fetchAnalysis({ reset: true });
  }

  syncPollingByMarketPhase();
});
```

- [ ] **Step 3: Expand teardown so every timer is released on unmount**

```ts
onBeforeUnmount(() => {
  stopPolling();
  clearMarketBoundaryTimer();
  cancelPendingRequests();
});
```

- [ ] **Step 4: Make sure empty watchlist transitions cannot leave stale polling alive**

```ts
function clearDashboardState() {
  stopPolling();
  cancelPendingRequests();
  clearQuoteState();
  clearAnalysisState();
}
```

- [ ] **Step 5: Preserve manual refresh regardless of market phase**

```ts
function manualRefresh() {
  if (!activeSymbol.value) {
    return;
  }

  void Promise.all([fetchQuote(), fetchAnalysis()]);
}
```

- [ ] **Step 6: Run the build again after lifecycle rewiring**

Run: `npm run build`
Expected: build still passes after removing the old unconditional `setInterval` startup

- [ ] **Step 7: Commit the session-aware lifecycle changes**

```bash
git add src/App.vue
git commit -m "feat: sync polling with trading sessions"
```

### Task 3: Update the hero status UI to reflect actual polling state

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: Add computed status text and badge activity derived from `marketPhase`, `activeSymbol`, and request state**

```ts
const liveStatusText = computed(() => {
  if (!activeInstrument.value) {
    return "未选择标的";
  }

  if (marketPhase.value === "trading") {
    return quoteLoading.value && !quote.value ? "连接中" : "实时轮询中";
  }

  if (marketPhase.value === "lunch_break") {
    return "午间休市，已停止自动刷新";
  }

  if (marketPhase.value === "pre_open") {
    return "未开盘，已停止自动刷新";
  }

  if (marketPhase.value === "weekend") {
    return "休市中，已停止自动刷新";
  }

  return "已收盘，已停止自动刷新";
});

const liveBadgeActive = computed(() => {
  return marketPhase.value === "trading" && !quoteLoading.value;
});
```

- [ ] **Step 2: Replace the hard-coded hero badge copy with the new computed state**

```vue
<span class="live-badge" :class="{ active: liveBadgeActive }">
  <span class="live-dot"></span>
  {{ liveStatusText }}
</span>
```

- [ ] **Step 3: Keep the timestamp area unchanged so users still see the last successful snapshot**

```vue
<span class="update-text">
  数据时间：{{ quote ? formatDateTime(quote.updatedAt) : "等待首帧数据" }}
</span>
```

- [ ] **Step 4: Run the production build after the template binding change**

Run: `npm run build`
Expected: Vue template type checking passes and the bundle builds successfully

- [ ] **Step 5: Commit the user-facing status update**

```bash
git add src/App.vue
git commit -m "feat: show market session polling status"
```

### Task 4: Manually verify boundary behavior and request safety

**Files:**
- Verify: `src/App.vue`
- Verify: `docs/superpowers/specs/2026-04-14-market-polling-session-design.md`

- [ ] **Step 1: Start the app locally**

Run: `npm run dev`
Expected: frontend and backend both start without crashing

- [ ] **Step 2: Verify trading-session behavior**

Check:
- during a valid trading window, the hero badge shows `实时轮询中`
- quote requests repeat every 5 seconds
- analysis requests repeat every 30 seconds
- clicking `立即刷新` still triggers an immediate request without waiting for the next timer

- [ ] **Step 3: Verify non-trading behavior**

Check:
- during lunch break, pre-open, after close, or weekend, the hero badge shows the matching stopped status
- no repeated `/api/quote` or `/api/analysis` requests continue after the page settles
- clicking `立即刷新` still performs one request for quote and one request for analysis

- [ ] **Step 4: Verify boundary transitions**

Check:
- when the page stays open across `11:30`, recurring requests stop automatically
- when the page stays open across `13:00`, recurring requests resume automatically
- when the page stays open across `15:00`, recurring requests stop automatically
- when the page stays open until the next workday `09:30`, recurring requests resume automatically

- [ ] **Step 5: Verify race-safety and symbol switching**

Check:
- switching symbols while requests are in flight does not let the old response overwrite the new symbol
- removing the active symbol or clearing the watchlist does not leave stray polling intervals alive
- returning to a valid symbol during a trading session restarts recurring polling exactly once

- [ ] **Step 6: Run a final build before handoff**

Run: `npm run build`
Expected: passes cleanly after the full implementation and manual verification

- [ ] **Step 7: Commit the verified feature**

```bash
git add src/App.vue
git commit -m "feat: stop market polling after close"
```

## Self-Review

- Spec coverage: this plan covers trading-window rules, lunch-break stop, after-close stop, next-session auto-resume, manual refresh continuity, UI status feedback, and timer/race cleanup.
- Placeholder scan: no `TODO`, `TBD`, or “handle appropriately” placeholders remain; every task names the exact file and concrete code or command.
- Type consistency: `MarketPhase`, `marketPhase`, `getMarketPhase()`, `getNextMarketBoundary()`, `startPolling()`, `stopPolling()`, `syncPollingByMarketPhase()`, and `clearMarketBoundaryTimer()` use the same names across all tasks.

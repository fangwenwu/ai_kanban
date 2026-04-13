# Market Dashboard ETF Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `513350` and `159326` to the market dashboard directory without changing existing rendering or request behavior.

**Architecture:** The sidebar already renders from `src/instruments.ts`, so the implementation only extends the existing instrument config array and updates the matching config test. No async request, timer, watcher, or event-listener logic changes are needed. Verification stays focused on the config source and the existing Node test entrypoint.

**Tech Stack:** Vue 3, TypeScript, Vite, Node.js test runner

---

### Task 1: Extend frontend instrument config

**Files:**
- Modify: `src/instruments.ts`
- Test: `server/instruments-config.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("frontend instruments config includes the new ETF symbols", async () => {
  const content = await readFile(
    new URL("../src/instruments.ts", import.meta.url),
    "utf8",
  );

  assert.match(content, /symbol:\s*"513350"/);
  assert.match(content, /symbol:\s*"159326"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/instruments-config.test.js`
Expected: FAIL because `src/instruments.ts` does not yet contain `513350` or `159326`

- [ ] **Step 3: Write minimal implementation**

```ts
  {
    symbol: "513350",
    displayName: "富国标普油气ETF",
    market: "SH",
    description: "富国标普油气ETF",
  },
  {
    symbol: "159326",
    displayName: "华夏电网设备ETF",
    market: "SZ",
    description: "华夏电网设备ETF",
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/instruments-config.test.js`
Expected: PASS with both existing `513100` assertions and new ETF assertions green

- [ ] **Step 5: Commit**

```bash
git add src/instruments.ts server/instruments-config.test.js
git commit -m "feat: add new etf dashboard entries"
```

### Task 2: Validate project health after config update

**Files:**
- Modify: `server/instruments-config.test.js`
- Verify: `src/App.vue`

- [ ] **Step 1: Confirm no UI code changes are required**

```ts
const activeInstrument = computed(() => {
  return instruments.find((item) => item.symbol === activeSymbol.value) ?? instruments[0];
});
```

This existing logic is the reason no `src/App.vue` code change is needed: the new items are auto-rendered by the `v-for="item in instruments"` loop and consumed by the existing `activeSymbol` flow.

- [ ] **Step 2: Run the targeted test suite**

Run: `node --test server/instruments-config.test.js`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS with no new diagnostics in edited files

- [ ] **Step 4: Commit**

```bash
git add src/instruments.ts server/instruments-config.test.js
git commit -m "test: verify new dashboard instrument entries"
```

# Stock Search Watchlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stock-code search box under the theme toggle, persist searched stocks into a dedicated server-side data folder, render the watchlist from stored data, and support deleting watchlist items safely.

**Architecture:** Keep the existing single-page Vue layout and current quote/analysis polling logic, but move watchlist state to a backend file-backed API. The backend owns the source of truth in `data/watchlist/stocks.json`, serializes writes to avoid concurrent overwrite, and the frontend loads, adds, deletes, and switches symbols based on API responses while preserving the existing abort and request-order protections.

**Tech Stack:** Vue 3, TypeScript, Node.js HTTP server, JSON file storage, Vite

---

### Task 1: Add file-backed watchlist storage on the backend

**Files:**
- Create: `server/watchlist-store.js`
- Create: `data/watchlist/stocks.json`

- [ ] **Step 1: Create the initial persisted watchlist data file**

```json
[
  {
    "symbol": "159980",
    "displayName": "大成有色ETF",
    "market": "SZ",
    "description": "有色金属主题"
  },
  {
    "symbol": "513100",
    "displayName": "国泰纳指ETF",
    "market": "SH",
    "description": "纳斯达克指数"
  },
  {
    "symbol": "513350",
    "displayName": "富国标普油气ETF",
    "market": "SH",
    "description": "富国标普油气ETF"
  },
  {
    "symbol": "159326",
    "displayName": "华夏电网设备ETF",
    "market": "SZ",
    "description": "华夏电网设备ETF"
  }
]
```

- [ ] **Step 2: Add a storage module that reads, writes, appends, deletes, and serializes file updates**

```js
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data/watchlist");
const WATCHLIST_FILE = path.join(DATA_DIR, "stocks.json");

const DEFAULT_WATCHLIST = [
  { symbol: "159980", displayName: "大成有色ETF", market: "SZ", description: "有色金属主题" },
  { symbol: "513100", displayName: "国泰纳指ETF", market: "SH", description: "纳斯达克指数" },
  { symbol: "513350", displayName: "富国标普油气ETF", market: "SH", description: "富国标普油气ETF" },
  { symbol: "159326", displayName: "华夏电网设备ETF", market: "SZ", description: "华夏电网设备ETF" },
];

let writeQueue = Promise.resolve();

function normalizeList(list) {
  return Array.isArray(list)
    ? list.filter((item) => item && typeof item.symbol === "string")
    : [];
}

async function ensureWatchlistFile() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(WATCHLIST_FILE, "utf8");
  } catch {
    await writeFile(WATCHLIST_FILE, JSON.stringify(DEFAULT_WATCHLIST, null, 2));
  }
}

export async function readWatchlist() {
  await ensureWatchlistFile();
  const content = await readFile(WATCHLIST_FILE, "utf8");
  return normalizeList(JSON.parse(content));
}

async function writeWatchlist(list) {
  await ensureWatchlistFile();
  await writeFile(WATCHLIST_FILE, `${JSON.stringify(list, null, 2)}\n`);
  return list;
}

function queueWrite(task) {
  const nextTask = writeQueue.then(task, task);
  writeQueue = nextTask.then(() => undefined, () => undefined);
  return nextTask;
}

export function addWatchlistItem(item) {
  return queueWrite(async () => {
    const list = await readWatchlist();
    if (list.some((entry) => entry.symbol === item.symbol)) {
      return list;
    }
    return writeWatchlist([...list, item]);
  });
}

export function removeWatchlistItem(symbol) {
  return queueWrite(async () => {
    const list = await readWatchlist();
    return writeWatchlist(list.filter((entry) => entry.symbol !== symbol));
  });
}
```

- [ ] **Step 3: Verify the storage module shape with a focused Node test**

```js
import test from "node:test";
import assert from "node:assert/strict";

import { readWatchlist } from "./watchlist-store.js";

test("readWatchlist returns an array of persisted instrument items", async () => {
  const list = await readWatchlist();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1);
  assert.equal(typeof list[0].symbol, "string");
});
```

### Task 2: Expose watchlist load, add, and delete APIs

**Files:**
- Modify: `server/index.js`
- Modify: `server/quote.js`
- Create: `server/watchlist-store.test.js`

- [ ] **Step 1: Export a reusable market helper for watchlist item creation**

```js
export function getExchangeCode(symbol) {
  return getSecIdBySymbol(symbol).startsWith("1.") ? "SH" : "SZ";
}
```

- [ ] **Step 2: Add JSON body parsing and new watchlist endpoints**

```js
if (request.method === "GET" && url.pathname === "/api/instruments") {
  const instruments = await readWatchlist();
  sendJson(response, 200, { success: true, data: instruments });
  return;
}

if (request.method === "POST" && url.pathname === "/api/instruments") {
  const { symbol } = await readJsonBody(request);
  const normalizedSymbol = String(symbol || "").trim();
  const quote = await fetchQuoteBySymbol(normalizedSymbol);
  const item = {
    symbol: normalizedSymbol,
    displayName: quote.name,
    market: getExchangeCode(normalizedSymbol),
    description: "搜索添加",
  };
  const instruments = await addWatchlistItem(item);
  sendJson(response, 200, { success: true, data: { instruments, item } });
  return;
}

if (request.method === "DELETE" && url.pathname === "/api/instruments") {
  const symbol = (url.searchParams.get("symbol") || "").trim();
  const instruments = await removeWatchlistItem(symbol);
  sendJson(response, 200, { success: true, data: instruments });
  return;
}
```

- [ ] **Step 3: Add a regression test that the storage module prevents duplicate entries and deletes by symbol**

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  addWatchlistItem,
  removeWatchlistItem,
  readWatchlist,
} from "./watchlist-store.js";

test("watchlist store deduplicates by symbol and removes exact symbols", async () => {
  const before = await readWatchlist();
  await addWatchlistItem({
    symbol: "159980",
    displayName: "大成有色ETF",
    market: "SZ",
    description: "搜索添加",
  });
  const afterAdd = await readWatchlist();
  const count = afterAdd.filter((item) => item.symbol === "159980").length;
  assert.equal(count, 1);

  await removeWatchlistItem("159980");
  const afterDelete = await readWatchlist();
  assert.ok(afterDelete.every((item) => item.symbol !== "159980"));

  assert.ok(before.length >= 1);
});
```

- [ ] **Step 4: Run the server tests**

Run: `node --test server/*.test.js`
Expected: all server tests pass, including the new watchlist regression test

### Task 3: Refactor the frontend watchlist state from static to API-backed

**Files:**
- Modify: `src/App.vue`
- Modify: `src/instruments.ts`
- Modify: `src/market-types.ts`

- [ ] **Step 1: Add shared instrument and watchlist response types**

```ts
export interface InstrumentItem {
  symbol: string;
  displayName: string;
  market: string;
  description: string;
}

export interface InstrumentMutationPayload {
  instruments: InstrumentItem[];
  item: InstrumentItem;
}
```

- [ ] **Step 2: Keep the existing instrument list as default fallback data**

```ts
export const defaultInstruments: InstrumentItem[] = [
  {
    symbol: "159980",
    displayName: "大成有色ETF",
    market: "SZ",
    description: "有色金属主题",
  },
];
```

- [ ] **Step 3: Replace the static watchlist dependency in `App.vue` with reactive API state**

```ts
const instruments = ref<InstrumentItem[]>([...defaultInstruments]);
const activeSymbol = ref(defaultInstruments[0]?.symbol ?? "");
const instrumentsLoading = ref(false);
const instrumentsError = ref("");
const searchKeyword = ref("");
const searchLoading = ref(false);
const searchError = ref("");
const deleteLoadingSymbol = ref("");

const activeInstrument = computed(() => {
  return instruments.value.find((item) => item.symbol === activeSymbol.value) ?? null;
});
```

- [ ] **Step 4: Add a watchlist loader and guarded symbol synchronizer**

```ts
function syncActiveSymbol(nextInstruments: InstrumentItem[], preferredSymbol = "") {
  if (!nextInstruments.length) {
    activeSymbol.value = "";
    quote.value = null;
    analysis.value = null;
    quoteLoading.value = false;
    analysisLoading.value = false;
    return;
  }

  if (preferredSymbol && nextInstruments.some((item) => item.symbol === preferredSymbol)) {
    activeSymbol.value = preferredSymbol;
    return;
  }

  if (!nextInstruments.some((item) => item.symbol === activeSymbol.value)) {
    activeSymbol.value = nextInstruments[0].symbol;
  }
}

async function fetchInstruments() {
  instrumentsLoading.value = true;
  instrumentsError.value = "";

  try {
    const response = await fetch("/api/instruments");
    const payload = await response.json() as ApiResponse<InstrumentItem[]>;
    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.message || "目录加载失败");
    }
    instruments.value = payload.data;
    syncActiveSymbol(payload.data);
  } catch (error) {
    instrumentsError.value = error instanceof Error ? error.message : "目录加载失败";
  } finally {
    instrumentsLoading.value = false;
  }
}
```

### Task 4: Add search and delete UI behavior with async safety

**Files:**
- Modify: `src/App.vue`
- Modify: `src/style.css`

- [ ] **Step 1: Insert the search form under the theme switch**

```vue
<form class="instrument-search" @submit.prevent="searchInstrument">
  <label class="sr-only" for="instrument-symbol">股票代码</label>
  <input
    id="instrument-symbol"
    v-model.trim="searchKeyword"
    type="text"
    inputmode="numeric"
    maxlength="6"
    placeholder="输入 6 位股票代码"
    :disabled="searchLoading"
  />
  <button type="submit" :disabled="searchLoading">
    {{ searchLoading ? "搜索中..." : "搜索股票" }}
  </button>
  <p v-if="searchError" class="search-feedback">{{ searchError }}</p>
</form>
```

- [ ] **Step 2: Add async-safe search and delete handlers**

```ts
async function searchInstrument() {
  const symbol = searchKeyword.value.trim();

  if (!/^\d{6}$/.test(symbol)) {
    searchError.value = "请输入 6 位股票代码";
    return;
  }

  searchLoading.value = true;
  searchError.value = "";

  try {
    const response = await fetch("/api/instruments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    const payload = await response.json() as ApiResponse<InstrumentMutationPayload>;
    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.message || "搜索股票失败");
    }
    instruments.value = payload.data.instruments;
    syncActiveSymbol(payload.data.instruments, payload.data.item.symbol);
    searchKeyword.value = "";
  } catch (error) {
    searchError.value = error instanceof Error ? error.message : "搜索股票失败";
  } finally {
    searchLoading.value = false;
  }
}

async function deleteInstrument(symbol: string) {
  deleteLoadingSymbol.value = symbol;
  searchError.value = "";

  try {
    const response = await fetch(`/api/instruments?symbol=${symbol}`, { method: "DELETE" });
    const payload = await response.json() as ApiResponse<InstrumentItem[]>;
    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.message || "删除股票失败");
    }
    const currentIndex = instruments.value.findIndex((item) => item.symbol === symbol);
    const nextSymbol = payload.data[currentIndex]?.symbol ?? payload.data[currentIndex - 1]?.symbol ?? "";
    instruments.value = payload.data;
    syncActiveSymbol(payload.data, nextSymbol);
  } catch (error) {
    searchError.value = error instanceof Error ? error.message : "删除股票失败";
  } finally {
    deleteLoadingSymbol.value = "";
  }
}
```

- [ ] **Step 3: Make each directory项显示删除按钮并阻止事件冒泡**

```vue
<button
  v-for="item in instruments"
  :key="item.symbol"
  type="button"
  class="instrument-item"
  :class="{ active: item.symbol === activeSymbol }"
  @click="switchInstrument(item.symbol)"
>
  <div class="instrument-item-head">
    <span class="instrument-market">{{ item.market }}</span>
    <button
      class="instrument-delete"
      type="button"
      :disabled="deleteLoadingSymbol === item.symbol"
      @click.stop="deleteInstrument(item.symbol)"
    >
      {{ deleteLoadingSymbol === item.symbol ? "删除中" : "删除" }}
    </button>
  </div>
</button>
```

- [ ] **Step 4: Add empty-state guards so polling does not run without an active symbol**

```ts
if (!activeSymbol.value) {
  return;
}
```

- [ ] **Step 5: Add the search and delete styles**

```css
.instrument-search {
  display: grid;
  gap: 10px;
}

.instrument-search input,
.instrument-search button,
.instrument-delete {
  height: 42px;
  border-radius: 14px;
}

.instrument-item-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}
```

### Task 5: Verify the integrated behavior and project health

**Files:**
- Verify: `src/App.vue`
- Verify: `src/style.css`
- Verify: `server/index.js`
- Verify: `server/watchlist-store.js`

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: Vue type checking and Vite build succeed

- [ ] **Step 2: Run the Node test suite**

Run: `node --test server/*.test.js`
Expected: all parsing tests and the new watchlist tests pass

- [ ] **Step 3: Manual regression check**

Run:

```bash
npm run dev
```

Expected:
- the sidebar shows a stock code input under the theme switch
- searching a valid 6-digit symbol adds it to the sidebar
- refreshing the page keeps the added symbol
- deleting a symbol removes it from the sidebar without switching to the deleted symbol first
- deleting the active symbol switches cleanly to the next available symbol or an empty state

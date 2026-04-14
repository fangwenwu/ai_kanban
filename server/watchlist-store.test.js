import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";

import {
  addWatchlistItem,
  readWatchlist,
  removeWatchlistItem,
} from "./watchlist-store.js";

async function createTempWatchlistFile() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-ui-watchlist-"));
  return path.join(tempDir, "stocks.json");
}

test("watchlist store initializes file, deduplicates symbols and removes by symbol", async () => {
  process.env.WATCHLIST_FILE = await createTempWatchlistFile();

  const initialList = await readWatchlist();
  assert.ok(initialList.length >= 1);

  const item = {
    symbol: "600519",
    displayName: "贵州茅台",
    market: "SH",
    description: "搜索添加",
  };

  await addWatchlistItem(item);
  await addWatchlistItem(item);

  const afterAdd = await readWatchlist();
  assert.equal(afterAdd.filter((entry) => entry.symbol === "600519").length, 1);

  await removeWatchlistItem("600519");

  const afterDelete = await readWatchlist();
  assert.ok(afterDelete.every((entry) => entry.symbol !== "600519"));
});

test("watchlist store serializes writes and keeps json valid", async () => {
  process.env.WATCHLIST_FILE = await createTempWatchlistFile();

  await Promise.all([
    addWatchlistItem({
      symbol: "000001",
      displayName: "平安银行",
      market: "SZ",
      description: "搜索添加",
    }),
    addWatchlistItem({
      symbol: "600036",
      displayName: "招商银行",
      market: "SH",
      description: "搜索添加",
    }),
  ]);

  const jsonText = await readFile(process.env.WATCHLIST_FILE, "utf8");
  const parsed = JSON.parse(jsonText);

  assert.ok(parsed.some((entry) => entry.symbol === "000001"));
  assert.ok(parsed.some((entry) => entry.symbol === "600036"));
});

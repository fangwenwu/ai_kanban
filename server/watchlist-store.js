import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE_PATH = path.resolve(__dirname, "../data/watchlist/stocks.json");

const DEFAULT_WATCHLIST = [
  {
    symbol: "159980",
    displayName: "大成有色ETF",
    market: "SZ",
    description: "有色金属主题",
  },
  {
    symbol: "513100",
    displayName: "国泰纳指ETF",
    market: "SH",
    description: "纳斯达克指数",
  },
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
];

let writeQueue = Promise.resolve();

function getWatchlistFilePath() {
  return process.env.WATCHLIST_FILE
    ? path.resolve(process.env.WATCHLIST_FILE)
    : DEFAULT_FILE_PATH;
}

function getDefaultWatchlist() {
  return DEFAULT_WATCHLIST.map((item) => ({ ...item }));
}

function normalizeWatchlist(list) {
  if (!Array.isArray(list)) {
    throw new Error("目录数据格式无效");
  }

  return list
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      symbol: String(item.symbol || "").trim(),
      displayName: String(item.displayName || "").trim(),
      market: String(item.market || "").trim().toUpperCase(),
      description: String(item.description || "").trim(),
    }))
    .filter((item) => /^\d{6}$/.test(item.symbol) && item.displayName && item.market);
}

async function ensureWatchlistFile() {
  const filePath = getWatchlistFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });

  try {
    await readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") {
      throw error;
    }

    await writeFile(filePath, `${JSON.stringify(getDefaultWatchlist(), null, 2)}\n`, "utf8");
  }

  return filePath;
}

async function writeWatchlist(list) {
  const filePath = await ensureWatchlistFile();
  await writeFile(filePath, `${JSON.stringify(list, null, 2)}\n`, "utf8");
  return list;
}

function queueWrite(task) {
  const nextTask = writeQueue.then(task, task);
  writeQueue = nextTask.then(
    () => undefined,
    () => undefined,
  );
  return nextTask;
}

export async function readWatchlist() {
  const filePath = await ensureWatchlistFile();
  const content = await readFile(filePath, "utf8");

  try {
    return normalizeWatchlist(JSON.parse(content));
  } catch (error) {
    throw new Error(
      error instanceof Error ? `目录数据读取失败: ${error.message}` : "目录数据读取失败",
    );
  }
}

export function addWatchlistItem(item) {
  return queueWrite(async () => {
    const normalizedItem = normalizeWatchlist([item])[0];

    if (!normalizedItem) {
      throw new Error("新增目录项无效");
    }

    const list = await readWatchlist();
    if (list.some((entry) => entry.symbol === normalizedItem.symbol)) {
      return list;
    }

    return writeWatchlist([...list, normalizedItem]);
  });
}

export function removeWatchlistItem(symbol) {
  return queueWrite(async () => {
    const normalizedSymbol = String(symbol || "").trim();

    if (!/^\d{6}$/.test(normalizedSymbol)) {
      throw new Error("证券代码格式不正确");
    }

    const list = await readWatchlist();
    return writeWatchlist(list.filter((entry) => entry.symbol !== normalizedSymbol));
  });
}

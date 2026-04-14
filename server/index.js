import { createServer } from "node:http";
import { fetchAnalysisBySymbol } from "./analysis.js";
import { fetchQuoteBySymbol, getExchangeCode } from "./quote.js";
import {
  addWatchlistItem,
  readWatchlist,
  removeWatchlistItem,
} from "./watchlist-store.js";

const PORT = 3000;
const DEFAULT_SYMBOL = "159980";

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function getErrorStatus(error) {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (/请求体|证券代码格式|目录项无效/.test(error.message)) {
    return 400;
  }

  return 502;
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求体 JSON 无效");
  }
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, {
      success: false,
      message: "请求地址无效",
    });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/instruments") {
    try {
      const instruments = await readWatchlist();

      sendJson(response, 200, {
        success: true,
        data: instruments,
      });
    } catch (error) {
      sendJson(response, getErrorStatus(error), {
        success: false,
        message: error instanceof Error ? error.message : "获取目录失败",
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/instruments") {
    try {
      const body = await readJsonBody(request);
      const symbol = String(body.symbol || "").trim();

      if (!/^\d{6}$/.test(symbol)) {
        throw new Error("证券代码格式不正确");
      }

      const quote = await fetchQuoteBySymbol(symbol);
      const instruments = await addWatchlistItem({
        symbol,
        displayName: quote.name,
        market: getExchangeCode(symbol),
        description: "搜索添加",
      });
      const item = instruments.find((entry) => entry.symbol === symbol);

      if (!item) {
        throw new Error("目录项生成失败");
      }

      sendJson(response, 200, {
        success: true,
        data: {
          instruments,
          item,
        },
      });
    } catch (error) {
      sendJson(response, getErrorStatus(error), {
        success: false,
        message: error instanceof Error ? error.message : "添加目录失败",
      });
    }
    return;
  }

  if (request.method === "DELETE" && url.pathname === "/api/instruments") {
    try {
      const symbol = String(url.searchParams.get("symbol") || "").trim();
      const instruments = await removeWatchlistItem(symbol);

      sendJson(response, 200, {
        success: true,
        data: instruments,
      });
    } catch (error) {
      sendJson(response, getErrorStatus(error), {
        success: false,
        message: error instanceof Error ? error.message : "删除目录失败",
      });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/quote") {
    const symbol = (url.searchParams.get("symbol") || DEFAULT_SYMBOL).trim();

    try {
      const quote = await fetchQuoteBySymbol(symbol);

      sendJson(response, 200, {
        success: true,
        data: quote,
      });
    } catch (error) {
      sendJson(response, 502, {
        success: false,
        message: error instanceof Error ? error.message : "获取行情失败",
      });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/analysis") {
    const symbol = (url.searchParams.get("symbol") || DEFAULT_SYMBOL).trim();

    try {
      const analysis = await fetchAnalysisBySymbol(symbol);

      sendJson(response, 200, {
        success: true,
        data: analysis,
      });
    } catch (error) {
      sendJson(response, 502, {
        success: false,
        message: error instanceof Error ? error.message : "获取趋势分析失败",
      });
    }
    return;
  }

  sendJson(response, 404, {
    success: false,
    message: "接口不存在",
  });
});

server.listen(PORT, () => {
  console.log(`Quote server is running on http://localhost:${PORT}`);
});

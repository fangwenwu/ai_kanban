const GBK_DECODER = new TextDecoder("gbk");
const QUOTE_MAX_AGE_SECONDS = 15;
const QUOTE_TOLERANCES = {
  pricePercent: 0.003,
  changePercentAbs: 0.2,
  volumePercent: 0.08,
  updatedAtMs: 15 * 1000,
};

function fromPriceUnit(value) {
  return Number((Number(value) / 1000).toFixed(3));
}

function parseNumber(value, digits = 3) {
  return Number(Number(value).toFixed(digits));
}

function getExchangePrefix(symbol) {
  return getSecIdBySymbol(symbol).startsWith("1.") ? "sh" : "sz";
}

export function getExchangeCode(symbol) {
  return getSecIdBySymbol(symbol).startsWith("1.") ? "SH" : "SZ";
}

function parseQqTimestamp(rawValue) {
  if (!/^\d{14}$/.test(rawValue)) {
    throw new Error("行情接口时间字段无效");
  }

  const isoText = `${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}T${rawValue.slice(8, 10)}:${rawValue.slice(10, 12)}:${rawValue.slice(12, 14)}+08:00`;
  return new Date(isoText).toISOString();
}

export function parseQqQuoteText(rawText) {
  const matched = rawText.trim().match(/^v_(?:sh|sz)(\d{6})="(.+)";$/);

  if (!matched) {
    throw new Error("行情接口返回格式异常");
  }

  const [, symbol, payload] = matched;
  const fields = payload.split("~");

  if (fields.length < 39) {
    throw new Error("行情接口字段不完整");
  }

  const name = fields[1];
  const price = Number(fields[3]);
  const previousClose = Number(fields[4]);
  const open = Number(fields[5]);
  const high = Number(fields[33]);
  const low = Number(fields[34]);
  const volumeHands = Number(fields[36] || fields[6]);
  const amountWan = Number(fields[57] || fields[37]);
  const turnoverRatePercent = fields[38] ? Number(fields[38]) : null;
  const amplitudePercent = Number(fields[43]);
  const updatedAt = parseQqTimestamp(fields[30]);

  if (
    !name
    || [price, previousClose, open, high, low, volumeHands, amountWan, amplitudePercent].some(Number.isNaN)
  ) {
    throw new Error("行情接口数据无效");
  }

  return {
    symbol,
    name,
    price: parseNumber(price),
    high: parseNumber(high),
    low: parseNumber(low),
    open: parseNumber(open),
    previousClose: parseNumber(previousClose),
    change: parseNumber(fields[31]),
    changePercent: parseNumber(fields[32], 2),
    volume: Math.round(volumeHands * 100),
    amount: parseNumber(amountWan * 10000, 3),
    amplitudePercent: parseNumber(amplitudePercent, 2),
    turnoverRatePercent: turnoverRatePercent == null ? null : parseNumber(turnoverRatePercent, 2),
    updatedAt,
  };
}

export function getSecIdBySymbol(symbol) {
  if (/^[56]\d{5}$/.test(symbol)) {
    return `1.${symbol}`;
  }

  if (/^\d{6}$/.test(symbol)) {
    return `0.${symbol}`;
  }

  throw new Error("证券代码格式不正确");
}

function buildQqQuoteUrl(symbol) {
  return `https://qt.gtimg.cn/q=${getExchangePrefix(symbol)}${symbol}`;
}

function buildSinaQuoteUrl(symbol) {
  return `https://hq.sinajs.cn/list=${getExchangePrefix(symbol)}${symbol}`;
}

async function requestQqQuoteText(symbol) {
  const response = await fetch(buildQqQuoteUrl(symbol), {
    headers: {
      Referer: "https://gu.qq.com/",
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`行情接口请求失败: ${response.status}`);
  }

  return GBK_DECODER.decode(await response.arrayBuffer());
}

async function requestSinaQuoteText(symbol) {
  const response = await fetch(buildSinaQuoteUrl(symbol), {
    headers: {
      Referer: "https://finance.sina.com.cn/",
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`备用行情接口请求失败: ${response.status}`);
  }

  return GBK_DECODER.decode(await response.arrayBuffer());
}

function toAgeSeconds(updatedAt, now) {
  const updatedAtMs = Date.parse(updatedAt);
  const nowMs = Date.parse(now);

  if (Number.isNaN(updatedAtMs) || Number.isNaN(nowMs)) {
    return null;
  }

  return Math.max(0, Math.round((nowMs - updatedAtMs) / 1000));
}

function compareQuotes(primaryQuote, secondaryQuote) {
  if (!secondaryQuote) {
    return {
      status: "warn",
      mismatches: [],
      warnings: ["备用源缺失，当前仅能部分验证真实性"],
    };
  }

  const mismatches = [];
  const priceDiffRatio = primaryQuote.price === 0
    ? 0
    : Math.abs(primaryQuote.price - secondaryQuote.price) / primaryQuote.price;

  if (priceDiffRatio > QUOTE_TOLERANCES.pricePercent) {
    mismatches.push({
      field: "price",
      primary: primaryQuote.price,
      secondary: secondaryQuote.price,
      tolerance: "0.3%",
    });
  }

  if (
    Math.abs(primaryQuote.changePercent - secondaryQuote.changePercent)
      > QUOTE_TOLERANCES.changePercentAbs
  ) {
    mismatches.push({
      field: "changePercent",
      primary: primaryQuote.changePercent,
      secondary: secondaryQuote.changePercent,
      tolerance: 0.2,
    });
  }

  const volumeDiffRatio = primaryQuote.volume === 0
    ? 0
    : Math.abs(primaryQuote.volume - secondaryQuote.volume) / primaryQuote.volume;

  if (volumeDiffRatio > QUOTE_TOLERANCES.volumePercent) {
    mismatches.push({
      field: "volume",
      primary: primaryQuote.volume,
      secondary: secondaryQuote.volume,
      tolerance: "8%",
    });
  }

  const primaryUpdatedAtMs = Date.parse(primaryQuote.updatedAt);
  const secondaryUpdatedAtMs = Date.parse(secondaryQuote.updatedAt);
  if (
    !Number.isNaN(primaryUpdatedAtMs)
    && !Number.isNaN(secondaryUpdatedAtMs)
    && Math.abs(primaryUpdatedAtMs - secondaryUpdatedAtMs) > QUOTE_TOLERANCES.updatedAtMs
  ) {
    mismatches.push({
      field: "updatedAt",
      primary: primaryQuote.updatedAt,
      secondary: secondaryQuote.updatedAt,
      tolerance: "15s",
    });
  }

  return {
    status: mismatches.length ? "fail" : "pass",
    mismatches,
    warnings: mismatches.length ? ["主备行情关键字段存在超阈值偏差"] : [],
  };
}

export function buildVerifiedQuote({
  primaryQuote,
  secondaryQuote,
  now = new Date().toISOString(),
}) {
  const ageSeconds = toAgeSeconds(primaryQuote.updatedAt, now);
  const freshnessStatus = ageSeconds == null || ageSeconds > QUOTE_MAX_AGE_SECONDS
    ? "stale"
    : "fresh";
  const consistency = compareQuotes(primaryQuote, secondaryQuote);
  const authenticityStatus = consistency.status === "fail"
    ? "invalid"
    : secondaryQuote
      ? "verified"
      : "partial";
  const warnings = [];

  if (freshnessStatus === "stale") {
    warnings.push("实时行情已超过15秒未更新");
  }
  warnings.push(...consistency.warnings);

  return {
    ...primaryQuote,
    source: "qq",
    verifiedAgainst: secondaryQuote ? "sina" : null,
    serverTime: now,
    quality: {
      freshness: {
        status: freshnessStatus,
        maxAgeSeconds: QUOTE_MAX_AGE_SECONDS,
        ageSeconds,
      },
      authenticity: {
        status: authenticityStatus,
        primarySource: "qq",
        secondarySource: secondaryQuote ? "sina" : null,
        fallbackUsed: !secondaryQuote,
      },
      completeness: {
        status: "complete",
        missingFields: [],
      },
      consistency: {
        status: consistency.status,
        mismatches: consistency.mismatches,
      },
      score: Math.max(
        0,
        100
          - (freshnessStatus === "stale" ? 25 : 0)
          - (!secondaryQuote ? 10 : 0)
          - (consistency.status === "fail" ? 30 : 0),
      ),
      degraded: freshnessStatus === "stale" || authenticityStatus !== "verified",
      warnings,
    },
  };
}

export function parseSinaQuoteText(rawText) {
  const matched = rawText.trim().match(/^var hq_str_(?:sh|sz)(\d{6})="(.+)";$/);

  if (!matched) {
    throw new Error("行情接口返回格式异常");
  }

  const [, symbol, payload] = matched;
  const fields = payload.split(",");

  if (fields.length < 32) {
    throw new Error("行情接口字段不完整");
  }

  const name = fields[0];
  const open = Number(fields[1]);
  const previousClose = Number(fields[2]);
  const price = Number(fields[3]);
  const high = Number(fields[4]);
  const low = Number(fields[5]);
  const volume = Number(fields[8]);
  const amount = Number(fields[9]);
  const updatedAt = new Date(`${fields[30]}T${fields[31]}+08:00`).toISOString();

  if (!name || Number.isNaN(price) || Number.isNaN(previousClose)) {
    throw new Error("行情接口数据无效");
  }

  const change = Number((price - previousClose).toFixed(3));
  const changePercent = previousClose
    ? Number((((price - previousClose) / previousClose) * 100).toFixed(2))
    : 0;
  const amplitudePercent = previousClose
    ? Number((((high - low) / previousClose) * 100).toFixed(2))
    : 0;

  return {
    symbol,
    name,
    price,
    high,
    low,
    open,
    previousClose,
    change,
    changePercent,
    volume,
    amount,
    amplitudePercent,
    turnoverRatePercent: null,
    updatedAt,
  };
}

export async function fetchQuoteBySymbol(symbol) {
  const now = new Date().toISOString();
  const [primaryResult, secondaryResult] = await Promise.allSettled([
    requestQqQuoteText(symbol),
    requestSinaQuoteText(symbol),
  ]);

  if (primaryResult.status !== "fulfilled") {
    throw primaryResult.reason;
  }

  const primaryQuote = parseQqQuoteText(primaryResult.value);
  const secondaryQuote = secondaryResult.status === "fulfilled"
    ? parseSinaQuoteText(secondaryResult.value)
    : null;

  return buildVerifiedQuote({
    primaryQuote,
    secondaryQuote,
    now,
  });
}

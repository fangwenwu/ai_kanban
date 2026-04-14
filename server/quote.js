const GBK_DECODER = new TextDecoder("gbk");

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
  const payload = await requestQqQuoteText(symbol);
  return parseQqQuoteText(payload);
}

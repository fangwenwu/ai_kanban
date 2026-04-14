import test from "node:test";
import assert from "node:assert/strict";

import {
  getExchangeCode,
  getSecIdBySymbol,
  parseQqQuoteText,
  parseSinaQuoteText,
} from "./quote.js";

test("parseQqQuoteText parses qq quote text and keeps volume or amount units aligned", () => {
  const mapped = parseQqQuoteText(
    'v_sh513100="1~纳指ETF国泰~513100~1.798~1.809~1.800~2150604~1080997~1069606~1.798~2531~1.797~15481~1.796~6143~1.795~9687~1.794~4923~1.800~23421~1.801~14447~1.802~10529~1.803~18988~1.804~714~~20260413161459~-0.011~-0.61~1.803~1.788~1.798/2150604/386330450~2150604~38633~2.27~~~1.803~1.788~0.83~170.20~170.20~0.00~1.990~1.628~0.82~-29334~1.796~~~~~~38633.0450~0.0000~0~ ~ETF~-5.57~3.87~~~~2.001~1.351~5.27~1.75~-5.32~9466110600~9466110600~-27.45~10.78~9466110600~4.35~1.7230~27.25~-0.06~1.7205~CNY~0~___D__F__Y~1.790~31144~";',
  );

  assert.deepEqual(mapped, {
    symbol: "513100",
    name: "纳指ETF国泰",
    price: 1.798,
    high: 1.803,
    low: 1.788,
    open: 1.8,
    previousClose: 1.809,
    change: -0.011,
    changePercent: -0.61,
    volume: 215060400,
    amount: 386330450,
    amplitudePercent: 0.83,
    turnoverRatePercent: 2.27,
    updatedAt: "2026-04-13T08:14:59.000Z",
  });
});

test("parseQqQuoteText throws when required qq quote fields are missing", () => {
  assert.throws(() => {
    parseQqQuoteText('v_sh513100="1~纳指ETF国泰~513100~1.798";');
  }, /行情接口字段不完整|行情接口数据无效/);
});

test("parseSinaQuoteText parses raw sina quote text", () => {
  const mapped = parseSinaQuoteText(
    'var hq_str_sz159980="有色ETF,2.038,2.042,2.041,2.047,2.036,2.041,2.042,82089800,167528602.600,360700,2.041,85700,2.040,8100,2.039,46000,2.038,656900,2.037,237200,2.042,134300,2.043,222000,2.044,282200,2.045,341200,2.046,2026-04-13,11:45:24,00";',
  );

  assert.deepEqual(mapped, {
    symbol: "159980",
    name: "有色ETF",
    price: 2.041,
    high: 2.047,
    low: 2.036,
    open: 2.038,
    previousClose: 2.042,
    change: -0.001,
    changePercent: -0.05,
    volume: 82089800,
    amount: 167528602.6,
    amplitudePercent: 0.54,
    turnoverRatePercent: null,
    updatedAt: "2026-04-13T03:45:24.000Z",
  });
});

test("getSecIdBySymbol maps sh etf code 513100 to sh market", () => {
  assert.equal(getSecIdBySymbol("513100"), "1.513100");
});

test("getExchangeCode maps symbols to uppercase market codes", () => {
  assert.equal(getExchangeCode("513100"), "SH");
  assert.equal(getExchangeCode("159980"), "SZ");
});

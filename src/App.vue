<template>
  <main class="app-layout" :class="themeClass">
    <aside class="sidebar">
      <div class="sidebar-header">
        <p class="sidebar-kicker">实时页面目录</p>
        <h1>行情看板</h1>
        <p>左侧切换标的，右侧展示实时行情与智能判断看板。</p>
      </div>

      <button class="theme-switch" type="button" @click="toggleTheme">
        {{ theme === "dark" ? "切换浅色主题" : "切换深色主题" }}
      </button>

      <form class="instrument-search" @submit.prevent="searchInstrument">
        <label class="sr-only" for="instrument-symbol">股票代码</label>
        <div class="instrument-search-row">
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
        </div>
        <p v-if="searchError" class="search-feedback">{{ searchError }}</p>
      </form>

      <p v-if="instrumentsLoading" class="sidebar-feedback">正在同步目录...</p>
      <p v-if="instrumentsError" class="sidebar-feedback is-error">
        {{ instrumentsError }}
      </p>

      <nav
        v-if="instruments.length"
        class="instrument-nav"
        aria-label="实时行情目录"
      >
        <article
          v-for="item in instruments"
          :key="item.symbol"
          class="instrument-entry"
        >
          <button
            type="button"
            class="instrument-item"
            :class="{ active: item.symbol === activeSymbol }"
            @click="switchInstrument(item.symbol)"
          >
            <span class="instrument-market">{{ item.market }}</span>
            <strong>{{ item.displayName }}</strong>
            <span>{{ item.symbol }}</span>
            <small>{{ item.description }}</small>
          </button>
          <button
            type="button"
            class="instrument-delete"
            :disabled="deleteLoadingSymbol === item.symbol"
            :aria-label="
              deleteLoadingSymbol === item.symbol
                ? `正在删除 ${item.displayName}`
                : `删除 ${item.displayName}`
            "
            @click.stop="deleteInstrument(item.symbol)"
          >
            <span class="sr-only">
              {{
                deleteLoadingSymbol === item.symbol
                  ? `正在删除 ${item.displayName}`
                  : `删除 ${item.displayName}`
              }}
            </span>
            <svg
              class="instrument-delete-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M9 3h6m-9 4h12m-1 0-.63 10.173A2 2 0 0 1 14.38 19H9.62a2 2 0 0 1-1.996-1.827L7 7m3 4v4m4-4v4"
              />
            </svg>
          </button>
        </article>
      </nav>

      <section v-else class="sidebar-empty">
        <p>暂无已添加股票，先搜索一个代码吧。</p>
      </section>
    </aside>

    <section class="content-shell">
      <section v-if="activeInstrument" class="hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">{{ activeInstrument.displayName }} 实时行情</p>
          <div class="title-row">
            <h2>{{ quote?.name || activeInstrument.displayName }}</h2>
            <span class="symbol-chip"
              >{{ activeInstrument.market }} {{ activeInstrument.symbol }}</span
            >
          </div>
          <p class="hero-description">
            实时快照每 5 秒刷新一次，趋势分析基于历史 K
            线、均线、MACD、BOLL、RSI 等指标计算。
          </p>
          <div class="status-row">
            <span class="live-badge" :class="{ active: liveBadgeActive }">
              <span class="live-dot"></span>
              {{ liveStatusText }}
            </span>
            <span class="update-text">
              数据时间：{{
                quote ? formatDateTime(quote.updatedAt) : "等待首帧数据"
              }}
            </span>
          </div>
        </div>

        <div class="hero-price" :class="priceToneClass">
          <p class="price-label">最新价</p>
          <div class="price-main">
            <strong>{{ quote ? formatPrice(quote.price) : "--" }}</strong>
            <span>{{ quote ? formatPercent(quote.changePercent) : "--" }}</span>
          </div>
          <div class="price-sub">
            <span>{{ quote ? formatSignedPrice(quote.change) : "--" }}</span>
            <span
              >昨收 {{ quote ? formatPrice(quote.previousClose) : "--" }}</span
            >
          </div>
          <button
            class="ghost-button"
            type="button"
            @click="manualRefresh"
            :disabled="quoteRefreshing || analysisLoading"
          >
            {{ quoteRefreshing || analysisLoading ? "刷新中..." : "立即刷新" }}
          </button>
        </div>
      </section>

      <section v-if="activeInstrument && quoteError" class="alert-banner">
        <span>{{ quoteError }}</span>
        <button
          type="button"
          @click="manualRefresh"
          :disabled="quoteRefreshing"
        >
          重试
        </button>
      </section>

      <section v-if="activeInstrument" class="metrics-grid">
        <article class="metric-card">
          <span>开盘</span>
          <strong>{{ quote ? formatPrice(quote.open) : "--" }}</strong>
        </article>
        <article class="metric-card">
          <span>最高</span>
          <strong>{{ quote ? formatPrice(quote.high) : "--" }}</strong>
        </article>
        <article class="metric-card">
          <span>最低</span>
          <strong>{{ quote ? formatPrice(quote.low) : "--" }}</strong>
        </article>
        <article class="metric-card">
          <span>振幅</span>
          <strong>{{
            quote ? formatPercent(quote.amplitudePercent) : "--"
          }}</strong>
        </article>
        <article class="metric-card">
          <span>成交量</span>
          <strong>{{
            quote ? formatCompactNumber(quote.volume) : "--"
          }}</strong>
        </article>
        <article class="metric-card">
          <span>成交额</span>
          <strong>{{
            quote ? formatCompactCurrency(quote.amount) : "--"
          }}</strong>
        </article>
      </section>

      <section v-if="activeInstrument" class="detail-grid">
        <article class="board-card spotlight-card">
          <div class="card-heading">
            <span>日内区间</span>
            <strong>{{
              quote
                ? `${formatPrice(quote.low)} - ${formatPrice(quote.high)}`
                : "--"
            }}</strong>
          </div>
          <div class="range-track">
            <span class="range-fill"></span>
            <span
              class="range-thumb"
              :style="{ left: `${rangeProgress}%` }"
            ></span>
          </div>
          <div class="range-meta">
            <span>低点 {{ quote ? formatPrice(quote.low) : "--" }}</span>
            <span>现价 {{ quote ? formatPrice(quote.price) : "--" }}</span>
            <span>高点 {{ quote ? formatPrice(quote.high) : "--" }}</span>
          </div>
        </article>

        <article class="board-card">
          <div class="card-heading">
            <span>当前页面</span>
            <strong>{{ activeInstrument.symbol }}</strong>
          </div>
          <dl class="summary-list">
            <div>
              <dt>目录名称</dt>
              <dd>{{ activeInstrument.displayName }}</dd>
            </div>
            <div>
              <dt>涨跌额</dt>
              <dd :class="priceToneClass">
                {{ quote ? formatSignedPrice(quote.change) : "--" }}
              </dd>
            </div>
            <div>
              <dt>换手率</dt>
              <dd>
                {{ quote ? formatPercent(quote.turnoverRatePercent) : "--" }}
              </dd>
            </div>
            <div>
              <dt>最近成功拉取</dt>
              <dd>
                {{ lastSuccessAt ? formatDateTime(lastSuccessAt) : "尚未成功" }}
              </dd>
            </div>
            <div>
              <dt>分析刷新</dt>
              <dd>30 秒 / 次</dd>
            </div>
          </dl>
        </article>
      </section>

      <section
        v-if="activeInstrument && quoteLoading && !quote"
        class="empty-state"
      >
        <p>正在拉取 {{ activeInstrument.displayName }} 最新行情...</p>
      </section>

      <TrendDashboard
        v-if="activeInstrument"
        :analysis="analysis"
        :loading="analysisLoading"
        :error="analysisError"
        :theme="theme"
        @retry="fetchAnalysis({ reset: true })"
      />

      <section v-else class="empty-state">
        <p>暂无正在查看的股票，请先在左侧输入股票代码并搜索添加。</p>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import TrendDashboard from "./components/TrendDashboard.vue";
import {
  instruments as defaultInstruments,
  type InstrumentItem,
} from "./instruments";
import {
  getMarketPhase,
  getNextMarketBoundary,
  isTradingSession,
} from "./market-session.js";
import type {
  ApiResponse,
  QuoteData,
  TrendAnalysisPayload,
} from "./market-types";

type InstrumentMutationPayload = {
  instruments: InstrumentItem[];
  item: InstrumentItem;
};

type MarketPhase =
  | "trading"
  | "lunch_break"
  | "pre_open"
  | "closed"
  | "weekend";

const instruments = ref<InstrumentItem[]>([...defaultInstruments]);
const activeSymbol = ref(defaultInstruments[0]?.symbol ?? "");
const quote = ref<QuoteData | null>(null);
const analysis = ref<TrendAnalysisPayload | null>(null);
const theme = ref<"dark" | "light">("dark");
const marketPhase = ref<MarketPhase>(getMarketPhase(new Date()));
const instrumentsLoading = ref(false);
const instrumentsError = ref("");
const searchKeyword = ref("");
const searchLoading = ref(false);
const searchError = ref("");
const deleteLoadingSymbol = ref("");
const quoteLoading = ref(true);
const quoteRefreshing = ref(false);
const analysisLoading = ref(true);
const quoteError = ref("");
const analysisError = ref("");
const lastSuccessAt = ref("");

let quoteRequestId = 0;
let analysisRequestId = 0;
let quoteController: AbortController | null = null;
let analysisController: AbortController | null = null;
let marketBoundaryTimer: number | null = null;
let quoteRefreshTimer: number | null = null;
let analysisRefreshTimer: number | null = null;

const activeInstrument = computed(() => {
  return (
    instruments.value.find(
      (item: InstrumentItem) => item.symbol === activeSymbol.value,
    ) ?? null
  );
});

const themeClass = computed(() => `theme-${theme.value}`);

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

const priceToneClass = computed(() => {
  if (!quote.value) {
    return "is-flat";
  }

  if (quote.value.change > 0) {
    return "is-up";
  }

  if (quote.value.change < 0) {
    return "is-down";
  }

  return "is-flat";
});

const rangeProgress = computed(() => {
  if (!quote.value) {
    return 50;
  }

  const spread = quote.value.high - quote.value.low;

  if (spread <= 0) {
    return 50;
  }

  const progress = ((quote.value.price - quote.value.low) / spread) * 100;
  return Math.min(100, Math.max(0, progress));
});

function cancelPendingRequests() {
  quoteRequestId += 1;
  analysisRequestId += 1;
  quoteController?.abort();
  analysisController?.abort();
  quoteController = null;
  analysisController = null;
}

function clearQuoteState() {
  quote.value = null;
  quoteError.value = "";
  quoteLoading.value = false;
  quoteRefreshing.value = false;
  lastSuccessAt.value = "";
}

function clearAnalysisState() {
  analysis.value = null;
  analysisError.value = "";
  analysisLoading.value = false;
}

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

function clearDashboardState() {
  stopPolling();
  cancelPendingRequests();
  clearQuoteState();
  clearAnalysisState();
}

function syncActiveSymbol(
  nextInstruments: InstrumentItem[],
  preferredSymbol = "",
) {
  if (!nextInstruments.length) {
    activeSymbol.value = "";
    clearDashboardState();
    return;
  }

  if (
    preferredSymbol &&
    nextInstruments.some((item) => item.symbol === preferredSymbol)
  ) {
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
    const payload = (await response.json()) as ApiResponse<InstrumentItem[]>;

    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.message || "目录加载失败");
    }

    instruments.value = payload.data;
    syncActiveSymbol(payload.data);
  } catch (requestError) {
    instrumentsError.value =
      requestError instanceof Error ? requestError.message : "目录加载失败";
  } finally {
    instrumentsLoading.value = false;
  }
}

async function fetchQuote(options: { reset?: boolean } = {}) {
  const symbol = activeSymbol.value;

  if (!symbol) {
    clearQuoteState();
    return;
  }

  const requestId = ++quoteRequestId;

  quoteController?.abort();
  const controller = new AbortController();
  quoteController = controller;

  if (options.reset) {
    quote.value = null;
    quoteLoading.value = true;
    quoteRefreshing.value = false;
  } else if (quote.value) {
    quoteRefreshing.value = true;
  } else {
    quoteLoading.value = true;
  }

  quoteError.value = "";

  try {
    const response = await fetch(`/api/quote?symbol=${symbol}`, {
      signal: controller.signal,
    });
    const payload = (await response.json()) as ApiResponse<QuoteData>;

    if (requestId !== quoteRequestId) {
      return;
    }

    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.message || "行情拉取失败");
    }

    quote.value = payload.data;
    lastSuccessAt.value = new Date().toISOString();
  } catch (requestError) {
    if (controller.signal.aborted || requestId !== quoteRequestId) {
      return;
    }

    quoteError.value =
      requestError instanceof Error ? requestError.message : "获取行情失败";
  } finally {
    if (requestId === quoteRequestId) {
      quoteLoading.value = false;
      quoteRefreshing.value = false;
    }

    if (quoteController === controller) {
      quoteController = null;
    }
  }
}

async function fetchAnalysis(options: { reset?: boolean } = {}) {
  const symbol = activeSymbol.value;

  if (!symbol) {
    clearAnalysisState();
    return;
  }

  const requestId = ++analysisRequestId;

  analysisController?.abort();
  const controller = new AbortController();
  analysisController = controller;

  if (options.reset) {
    analysis.value = null;
    analysisLoading.value = true;
  } else if (!analysis.value) {
    analysisLoading.value = true;
  }

  analysisError.value = "";

  try {
    const response = await fetch(`/api/analysis?symbol=${symbol}`, {
      signal: controller.signal,
    });
    const payload =
      (await response.json()) as ApiResponse<TrendAnalysisPayload>;

    if (requestId !== analysisRequestId) {
      return;
    }

    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.message || "趋势分析拉取失败");
    }

    analysis.value = payload.data;
  } catch (requestError) {
    if (controller.signal.aborted || requestId !== analysisRequestId) {
      return;
    }

    analysisError.value =
      requestError instanceof Error ? requestError.message : "趋势分析拉取失败";
  } finally {
    if (requestId === analysisRequestId) {
      analysisLoading.value = false;
    }

    if (analysisController === controller) {
      analysisController = null;
    }
  }
}

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
  marketPhase.value = getMarketPhase(now) as MarketPhase;

  if (isTradingSession(now) && activeSymbol.value) {
    startPolling();
  } else {
    stopPolling();
  }

  scheduleNextMarketBoundaryCheck();
}

function switchInstrument(symbol: string) {
  if (symbol === activeSymbol.value) {
    return;
  }

  activeSymbol.value = symbol;
}

function manualRefresh() {
  if (!activeSymbol.value) {
    return;
  }

  void Promise.all([fetchQuote(), fetchAnalysis()]);
}

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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ symbol }),
    });
    const payload =
      (await response.json()) as ApiResponse<InstrumentMutationPayload>;

    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.message || "搜索股票失败");
    }

    const previousActiveSymbol = activeSymbol.value;
    instruments.value = payload.data.instruments;
    syncActiveSymbol(payload.data.instruments, payload.data.item.symbol);
    searchKeyword.value = "";

    if (payload.data.item.symbol === previousActiveSymbol) {
      manualRefresh();
    }
  } catch (requestError) {
    searchError.value =
      requestError instanceof Error ? requestError.message : "搜索股票失败";
  } finally {
    searchLoading.value = false;
  }
}

async function deleteInstrument(symbol: string) {
  const currentIndex = instruments.value.findIndex(
    (item: InstrumentItem) => item.symbol === symbol,
  );
  const preferredSymbol =
    activeSymbol.value === symbol
      ? (instruments.value[currentIndex + 1]?.symbol ??
        instruments.value[currentIndex - 1]?.symbol ??
        "")
      : activeSymbol.value;

  deleteLoadingSymbol.value = symbol;
  searchError.value = "";

  try {
    const response = await fetch(`/api/instruments?symbol=${symbol}`, {
      method: "DELETE",
    });
    const payload = (await response.json()) as ApiResponse<InstrumentItem[]>;

    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.message || "删除股票失败");
    }

    instruments.value = payload.data;
    syncActiveSymbol(payload.data, preferredSymbol);
  } catch (requestError) {
    searchError.value =
      requestError instanceof Error ? requestError.message : "删除股票失败";
  } finally {
    deleteLoadingSymbol.value = "";
  }
}

function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
}

function formatPrice(value: number) {
  return value.toFixed(3);
}

function formatSignedPrice(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(3)}`;
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "--";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompactCurrency(value: number) {
  return `${new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)} 元`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

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

onMounted(() => {
  void fetchInstruments();

  if (activeSymbol.value) {
    void fetchQuote({ reset: true });
    void fetchAnalysis({ reset: true });
  }

  syncPollingByMarketPhase();
});

onBeforeUnmount(() => {
  stopPolling();
  clearMarketBoundaryTimer();
  cancelPendingRequests();
});
</script>

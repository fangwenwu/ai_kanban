<template>
  <main class="app-layout" :class="themeClass">
    <aside class="sidebar">
      <div class="sidebar-header">
        <p class="sidebar-kicker">实时页面目录</p>
        <h1>行情看板</h1>
        <p>左侧切换标的，右侧展示实时行情与智能判断看板。</p>
      </div>

      <button class="theme-switch" type="button" @click="toggleTheme">
        {{ theme === 'dark' ? '切换浅色主题' : '切换深色主题' }}
      </button>

      <nav class="instrument-nav" aria-label="实时行情目录">
        <button
          v-for="item in instruments"
          :key="item.symbol"
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
      </nav>
    </aside>

    <section class="content-shell">
      <section class="hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">{{ activeInstrument.displayName }} 实时行情</p>
          <div class="title-row">
            <h2>{{ quote?.name || activeInstrument.displayName }}</h2>
            <span class="symbol-chip">{{ activeInstrument.market }} {{ activeInstrument.symbol }}</span>
          </div>
          <p class="hero-description">
            实时快照每 5 秒刷新一次，趋势分析基于历史 K 线、均线、MACD、BOLL、RSI 等指标计算。
          </p>
          <div class="status-row">
            <span class="live-badge" :class="{ active: !quoteLoading }">
              <span class="live-dot"></span>
              {{ quoteLoading ? '连接中' : '实时轮询中' }}
            </span>
            <span class="update-text">
              数据时间：{{ quote ? formatDateTime(quote.updatedAt) : '等待首帧数据' }}
            </span>
          </div>
        </div>

        <div class="hero-price" :class="priceToneClass">
          <p class="price-label">最新价</p>
          <div class="price-main">
            <strong>{{ quote ? formatPrice(quote.price) : '--' }}</strong>
            <span>{{ quote ? formatPercent(quote.changePercent) : '--' }}</span>
          </div>
          <div class="price-sub">
            <span>{{ quote ? formatSignedPrice(quote.change) : '--' }}</span>
            <span>昨收 {{ quote ? formatPrice(quote.previousClose) : '--' }}</span>
          </div>
          <button class="ghost-button" type="button" @click="manualRefresh" :disabled="quoteRefreshing || analysisLoading">
            {{ quoteRefreshing || analysisLoading ? '刷新中...' : '立即刷新' }}
          </button>
        </div>
      </section>

      <section v-if="quoteError" class="alert-banner">
        <span>{{ quoteError }}</span>
        <button type="button" @click="manualRefresh" :disabled="quoteRefreshing">重试</button>
      </section>

      <section class="metrics-grid">
        <article class="metric-card">
          <span>开盘</span>
          <strong>{{ quote ? formatPrice(quote.open) : '--' }}</strong>
        </article>
        <article class="metric-card">
          <span>最高</span>
          <strong>{{ quote ? formatPrice(quote.high) : '--' }}</strong>
        </article>
        <article class="metric-card">
          <span>最低</span>
          <strong>{{ quote ? formatPrice(quote.low) : '--' }}</strong>
        </article>
        <article class="metric-card">
          <span>振幅</span>
          <strong>{{ quote ? formatPercent(quote.amplitudePercent) : '--' }}</strong>
        </article>
        <article class="metric-card">
          <span>成交量</span>
          <strong>{{ quote ? formatCompactNumber(quote.volume) : '--' }}</strong>
        </article>
        <article class="metric-card">
          <span>成交额</span>
          <strong>{{ quote ? formatCompactCurrency(quote.amount) : '--' }}</strong>
        </article>
      </section>

      <section class="detail-grid">
        <article class="board-card spotlight-card">
          <div class="card-heading">
            <span>日内区间</span>
            <strong>{{ quote ? `${formatPrice(quote.low)} - ${formatPrice(quote.high)}` : '--' }}</strong>
          </div>
          <div class="range-track">
            <span class="range-fill"></span>
            <span class="range-thumb" :style="{ left: `${rangeProgress}%` }"></span>
          </div>
          <div class="range-meta">
            <span>低点 {{ quote ? formatPrice(quote.low) : '--' }}</span>
            <span>现价 {{ quote ? formatPrice(quote.price) : '--' }}</span>
            <span>高点 {{ quote ? formatPrice(quote.high) : '--' }}</span>
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
              <dd :class="priceToneClass">{{ quote ? formatSignedPrice(quote.change) : '--' }}</dd>
            </div>
            <div>
              <dt>换手率</dt>
              <dd>{{ quote ? formatPercent(quote.turnoverRatePercent) : '--' }}</dd>
            </div>
            <div>
              <dt>最近成功拉取</dt>
              <dd>{{ lastSuccessAt ? formatDateTime(lastSuccessAt) : '尚未成功' }}</dd>
            </div>
            <div>
              <dt>分析刷新</dt>
              <dd>30 秒 / 次</dd>
            </div>
          </dl>
        </article>
      </section>

      <section v-if="quoteLoading && !quote" class="empty-state">
        <p>正在拉取 {{ activeInstrument.displayName }} 最新行情...</p>
      </section>

      <TrendDashboard
        :analysis="analysis"
        :loading="analysisLoading"
        :error="analysisError"
        :theme="theme"
        @retry="fetchAnalysis({ reset: true })"
      />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import TrendDashboard from './components/TrendDashboard.vue';
import { instruments } from './instruments';
import type { ApiResponse, QuoteData, TrendAnalysisPayload } from './market-types';

const activeSymbol = ref(instruments[0].symbol);
const quote = ref<QuoteData | null>(null);
const analysis = ref<TrendAnalysisPayload | null>(null);
const theme = ref<'dark' | 'light'>('dark');
const quoteLoading = ref(true);
const quoteRefreshing = ref(false);
const analysisLoading = ref(true);
const quoteError = ref('');
const analysisError = ref('');
const lastSuccessAt = ref('');

let quoteRequestId = 0;
let analysisRequestId = 0;
let quoteController: AbortController | null = null;
let analysisController: AbortController | null = null;
let quoteRefreshTimer: number | null = null;
let analysisRefreshTimer: number | null = null;

const activeInstrument = computed(() => {
  return instruments.find((item) => item.symbol === activeSymbol.value) ?? instruments[0];
});

const themeClass = computed(() => `theme-${theme.value}`);

const priceToneClass = computed(() => {
  if (!quote.value) {
    return 'is-flat';
  }

  if (quote.value.change > 0) {
    return 'is-up';
  }

  if (quote.value.change < 0) {
    return 'is-down';
  }

  return 'is-flat';
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

async function fetchQuote(options: { reset?: boolean } = {}) {
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

  quoteError.value = '';

  try {
    const response = await fetch(`/api/quote?symbol=${activeSymbol.value}`, {
      signal: controller.signal,
    });
    const payload = (await response.json()) as ApiResponse<QuoteData>;

    if (requestId !== quoteRequestId) {
      return;
    }

    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.message || '行情拉取失败');
    }

    quote.value = payload.data;
    lastSuccessAt.value = new Date().toISOString();
  } catch (requestError) {
    if (controller.signal.aborted || requestId !== quoteRequestId) {
      return;
    }

    quoteError.value = requestError instanceof Error ? requestError.message : '获取行情失败';
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

  analysisError.value = '';

  try {
    const response = await fetch(`/api/analysis?symbol=${activeSymbol.value}`, {
      signal: controller.signal,
    });
    const payload = (await response.json()) as ApiResponse<TrendAnalysisPayload>;

    if (requestId !== analysisRequestId) {
      return;
    }

    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.message || '趋势分析拉取失败');
    }

    analysis.value = payload.data;
  } catch (requestError) {
    if (controller.signal.aborted || requestId !== analysisRequestId) {
      return;
    }

    analysisError.value = requestError instanceof Error ? requestError.message : '趋势分析拉取失败';
  } finally {
    if (requestId === analysisRequestId) {
      analysisLoading.value = false;
    }

    if (analysisController === controller) {
      analysisController = null;
    }
  }
}

function switchInstrument(symbol: string) {
  if (symbol === activeSymbol.value) {
    return;
  }

  activeSymbol.value = symbol;
}

function manualRefresh() {
  void Promise.all([
    fetchQuote(),
    fetchAnalysis(),
  ]);
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
}

function formatPrice(value: number) {
  return value.toFixed(3);
}

function formatSignedPrice(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(3)}`;
}

function formatPercent(value: number | null) {
  if (value === null) {
    return '--';
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompactCurrency(value: number) {
  return `${new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)} 元`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

watch(activeSymbol, () => {
  void fetchQuote({ reset: true });
  void fetchAnalysis({ reset: true });
});

onMounted(() => {
  void fetchQuote({ reset: true });
  void fetchAnalysis({ reset: true });
  quoteRefreshTimer = window.setInterval(() => {
    void fetchQuote();
  }, 5000);
  analysisRefreshTimer = window.setInterval(() => {
    void fetchAnalysis();
  }, 30000);
});

onBeforeUnmount(() => {
  quoteRequestId += 1;
  analysisRequestId += 1;

  if (quoteRefreshTimer !== null) {
    window.clearInterval(quoteRefreshTimer);
  }

  if (analysisRefreshTimer !== null) {
    window.clearInterval(analysisRefreshTimer);
  }

  quoteController?.abort();
  analysisController?.abort();
});
</script>

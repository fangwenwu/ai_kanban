<template>
  <section class="analysis-section">
    <div class="section-head">
      <div>
        <p class="section-kicker">智能判断看板</p>
        <h3>涨跌 / 横盘趋势分析</h3>
      </div>
      <button
        class="analysis-refresh"
        type="button"
        @click="$emit('retry')"
        :disabled="loading"
      >
        {{ loading ? "分析中..." : "刷新分析" }}
      </button>
    </div>

    <section v-if="error" class="analysis-error">
      <span>{{ error }}</span>
      <button type="button" @click="$emit('retry')" :disabled="loading">
        重试
      </button>
    </section>

    <section v-else-if="loading && !analysis" class="analysis-empty">
      <p>正在计算趋势判断与技术指标...</p>
    </section>

    <template v-else-if="analysis">
      <section class="trend-hero">
        <div class="trend-result" :class="trendToneClass">
          <span class="trend-label">趋势结论</span>
          <strong>{{ analysis.analysis.trendLabel }}</strong>
          <p>{{ analysis.analysis.summary }}</p>
        </div>

        <div class="trend-summary-grid">
          <article class="summary-chip">
            <span>横盘命中数</span>
            <strong>{{ analysis.analysis.sidewaysSignals.length }} / 5</strong>
          </article>
          <article class="summary-chip">
            <span>K线形态</span>
            <strong>{{
              analysis.analysis.indicators.pattern.candleType
            }}</strong>
          </article>
          <article class="summary-chip">
            <span>量价关系</span>
            <strong>{{ analysis.analysis.indicators.volume.relation }}</strong>
          </article>
          <article class="summary-chip">
            <span>主力资金</span>
            <strong>{{
              analysis.analysis.indicators.capital.mainForceDirection
            }}</strong>
          </article>
          <article class="advice-card" :class="adviceToneClass">
            <div class="advice-head">
              <span class="trend-label">操作建议</span>
              <strong>{{ advice.action ?? "--" }}</strong>
              <em>置信度 {{ advice.confidence ?? "--" }}</em>
            </div>
            <div class="advice-metrics">
              <span>
                目标价
                {{ formatAdvicePrice(advice.targetPrice) }}
              </span>
              <span>
                失效价
                {{ formatAdvicePrice(advice.stopPrice) }}
              </span>
              <span>建议周期 {{ advice.holdingWindow ?? "--" }}</span>
            </div>
            <div class="advice-tags">
              <span
                v-for="tag in advice.reasonTags ?? []"
                :key="tag"
                class="advice-tag"
              >
                {{ tag }}
              </span>
            </div>
            <p class="advice-copy">{{ advice.rationale ?? "--" }}</p>
            <p class="advice-risk">风险提示：{{ advice.riskNote ?? "--" }}</p>
          </article>
        </div>
      </section>

      <section class="signal-grid">
        <article
          class="signal-card"
          :class="signalTone(analysis.analysis.indicators.ma.bias)"
        >
          <span>均线排列</span>
          <strong>{{ analysis.analysis.indicators.ma.state }}</strong>
          <p>{{ analysis.analysis.indicators.ma.detail }}</p>
          <small>
            {{
              analysis.analysis.indicators.ma.value
                .map((item) => item.toFixed(3))
                .join(" / ")
            }}
          </small>
        </article>
        <article
          class="signal-card"
          :class="signalTone(analysis.analysis.indicators.macd.bias)"
        >
          <span>MACD</span>
          <strong>{{ analysis.analysis.indicators.macd.state }}</strong>
          <p>{{ analysis.analysis.indicators.macd.zeroAxis }}</p>
          <small>
            DIF {{ analysis.analysis.indicators.macd.value.dif }}, DEA
            {{ analysis.analysis.indicators.macd.value.dea }}
          </small>
        </article>
        <article
          class="signal-card"
          :class="
            signalTone(
              analysis.analysis.indicators.boll.position.includes('上')
                ? '偏多'
                : analysis.analysis.indicators.boll.position.includes('下')
                  ? '偏空'
                  : '中性',
            )
          "
        >
          <span>BOLL</span>
          <strong>{{ analysis.analysis.indicators.boll.state }}</strong>
          <p>{{ analysis.analysis.indicators.boll.position }}</p>
          <small
            >宽度
            {{ analysis.analysis.indicators.boll.value.widthPercent }}%</small
          >
        </article>
        <article
          class="signal-card"
          :class="signalTone(analysis.analysis.indicators.rsi.bias)"
        >
          <span>RSI</span>
          <strong>{{ analysis.analysis.indicators.rsi.state }}</strong>
          <p>当前值 {{ analysis.analysis.indicators.rsi.value }}</p>
          <small>50 上方偏强，40-60 可判横盘</small>
        </article>
        <article
          class="signal-card"
          :class="
            signalTone(
              analysis.analysis.indicators.volume.relation.includes('涨')
                ? '偏多'
                : analysis.analysis.indicators.volume.relation.includes('跌')
                  ? '偏空'
                  : '中性',
            )
          "
        >
          <span>量能</span>
          <strong>{{ analysis.analysis.indicators.volume.state }}</strong>
          <p>{{ analysis.analysis.indicators.volume.relation }}</p>
          <small
            >量比 {{ analysis.analysis.indicators.volume.volumeRatio }}</small
          >
        </article>
        <article
          class="signal-card"
          :class="
            signalTone(
              analysis.analysis.trendLabel === '上涨趋势'
                ? '偏多'
                : analysis.analysis.trendLabel === '下跌趋势'
                  ? '偏空'
                  : '中性',
            )
          "
        >
          <span>形态 / 资金</span>
          <strong>{{ analysis.analysis.indicators.pattern.pattern }}</strong>
          <p>{{ analysis.analysis.indicators.capital.mainForceDirection }}</p>
          <small>
            {{
              formatMoney(
                analysis.analysis.indicators.capital.mainForceNetAmount,
              )
            }}
          </small>
        </article>
      </section>

      <section class="sideways-panel">
        <div class="panel-head">
          <h4>横盘震荡专属规则</h4>
          <span>满足 3 项以上即判定横盘</span>
        </div>
        <div class="sideways-tags">
          <span
            v-for="rule in sidewaysRules"
            :key="rule"
            class="sideways-tag"
            :class="{
              active: analysis.analysis.sidewaysSignals.includes(rule),
            }"
          >
            {{ rule }}
          </span>
        </div>
      </section>

      <section class="chart-grid">
        <article class="chart-card chart-large">
          <div class="panel-head">
            <h4>K线 / 均线 / BOLL</h4>
            <span>悬停可查看详细数据</span>
          </div>
          <div ref="priceChartRef" class="chart-canvas"></div>
        </article>

        <article class="chart-card">
          <div class="panel-head">
            <h4>成交量</h4>
            <span>观察放量与缩量</span>
          </div>
          <div ref="volumeChartRef" class="chart-canvas"></div>
        </article>

        <article class="chart-card">
          <div class="panel-head">
            <h4>MACD</h4>
            <span>金叉 / 死叉 / 零轴</span>
          </div>
          <div ref="macdChartRef" class="chart-canvas"></div>
        </article>

        <article class="chart-card">
          <div class="panel-head">
            <h4>RSI</h4>
            <span>40-60 区间重点观察</span>
          </div>
          <div ref="rsiChartRef" class="chart-canvas"></div>
        </article>

        <article class="chart-card">
          <div class="panel-head">
            <h4>换手率对比</h4>
            <span>当日与 5 / 10 / 20 / 60 日均线</span>
          </div>
          <div ref="turnoverChartRef" class="chart-canvas"></div>
        </article>

        <article class="chart-card">
          <div class="panel-head">
            <h4>主力资金净流入 / 净流出</h4>
            <span>真实历史主力资金与 5 / 10 日均线</span>
          </div>
          <div ref="capitalFlowChartRef" class="chart-canvas"></div>
        </article>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { BarChart, CandlestickChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { init, use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import type { EChartsType } from "echarts/core";
import type { TrendAnalysisPayload } from "../market-types";

use([
  BarChart,
  CandlestickChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

const props = defineProps<{
  analysis: TrendAnalysisPayload | null;
  loading: boolean;
  error: string;
  theme: "dark" | "light";
}>();

type CandlePoint =
  TrendAnalysisPayload["analysis"]["charts"]["candles"][number];
type Advice = TrendAnalysisPayload["analysis"]["advice"];

defineEmits<{
  retry: [];
}>();

const priceChartRef = ref<HTMLDivElement | null>(null);
const volumeChartRef = ref<HTMLDivElement | null>(null);
const macdChartRef = ref<HTMLDivElement | null>(null);
const rsiChartRef = ref<HTMLDivElement | null>(null);
const turnoverChartRef = ref<HTMLDivElement | null>(null);
const capitalFlowChartRef = ref<HTMLDivElement | null>(null);

let priceChart: EChartsType | null = null;
let volumeChart: EChartsType | null = null;
let macdChart: EChartsType | null = null;
let rsiChart: EChartsType | null = null;
let turnoverChart: EChartsType | null = null;
let capitalFlowChart: EChartsType | null = null;

const sidewaysRules = [
  "BOLL带收口变窄",
  "均线粘合缠绕",
  "成交量持续萎缩",
  "股价波动幅度<5%",
  "RSI在40-60之间",
];

const palette = computed(() => {
  if (props.theme === "light") {
    return {
      text: "#1e293b",
      axis: "#64748b",
      split: "rgba(100, 116, 139, 0.15)",
      up: "#dc2626",
      down: "#16a34a",
      neutral: "#475569",
      lineA: "#2563eb",
      lineB: "#7c3aed",
      lineC: "#f59e0b",
      lineD: "#0f766e",
      card: "rgba(255, 255, 255, 0.94)",
    };
  }

  return {
    text: "#e2e8f0",
    axis: "#94a3b8",
    split: "rgba(148, 163, 184, 0.16)",
    up: "#f87171",
    down: "#4ade80",
    neutral: "#cbd5e1",
    lineA: "#60a5fa",
    lineB: "#c084fc",
    lineC: "#facc15",
    lineD: "#2dd4bf",
    card: "rgba(15, 23, 42, 0.82)",
  };
});

const trendToneClass = computed(() => {
  if (!props.analysis) {
    return "is-neutral";
  }

  if (props.analysis.analysis.trendLabel === "上涨趋势") {
    return "is-bullish";
  }

  if (props.analysis.analysis.trendLabel === "下跌趋势") {
    return "is-bearish";
  }

  return "is-neutral";
});

const advice = computed<Advice>(() => props.analysis?.analysis.advice ?? {});

const adviceToneClass = computed(() => {
  const action = advice.value.action;

  if (action === "买入") {
    return "tone-bullish";
  }

  if (action === "卖出") {
    return "tone-bearish";
  }

  return "tone-neutral";
});

function signalTone(bias: string) {
  if (bias === "偏多") {
    return "tone-bullish";
  }

  if (bias === "偏空") {
    return "tone-bearish";
  }

  return "tone-neutral";
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)} 元`;
}

function formatAdvicePrice(value: number | null | undefined) {
  if (value == null) {
    return "--";
  }

  return value.toFixed(3);
}

function formatMoneyCompact(value: number | null) {
  if (value == null) {
    return "--";
  }

  const abs = Math.abs(value);
  if (abs >= 1e8) {
    return `${(value / 1e8).toFixed(2)}亿`;
  }
  if (abs >= 1e4) {
    return `${(value / 1e4).toFixed(2)}万`;
  }
  return `${value.toFixed(0)}`;
}

function disposeChart(instance: EChartsType | null) {
  instance?.dispose();
  return null;
}

function disposeCharts() {
  priceChart = disposeChart(priceChart);
  volumeChart = disposeChart(volumeChart);
  macdChart = disposeChart(macdChart);
  rsiChart = disposeChart(rsiChart);
  turnoverChart = disposeChart(turnoverChart);
  capitalFlowChart = disposeChart(capitalFlowChart);
}

function initChart(
  element: HTMLDivElement | null,
  instance: EChartsType | null,
) {
  if (!element) {
    return disposeChart(instance);
  }

  if (instance && instance.getDom() !== element) {
    instance.dispose();
    return init(element);
  }

  return instance ?? init(element);
}

function buildPriceOption(): EChartsOption {
  const chartData = props.analysis?.analysis.charts;
  const tone = palette.value;
  const dates = chartData?.candles.map((item: CandlePoint) => item.date) ?? [];

  return {
    animation: false,
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
    },
    legend: {
      top: 0,
      textStyle: { color: tone.text },
    },
    grid: {
      left: 16,
      right: 16,
      top: 42,
      bottom: 18,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: dates,
      axisLine: { lineStyle: { color: tone.axis } },
      axisLabel: { color: tone.axis, showMaxLabel: true, showMinLabel: true },
    },
    yAxis: {
      scale: true,
      axisLine: { show: false },
      axisLabel: { color: tone.axis },
      splitLine: { lineStyle: { color: tone.split } },
    },
    series: [
      {
        name: "K线",
        type: "candlestick",
        data:
          chartData?.candles.map((item: CandlePoint) => [
            item.open,
            item.close,
            item.low,
            item.high,
          ]) ?? [],
        itemStyle: {
          color: tone.up,
          color0: tone.down,
          borderColor: tone.up,
          borderColor0: tone.down,
        },
      },
      {
        name: "MA5",
        type: "line",
        showSymbol: false,
        data: chartData?.ma.ma5 ?? [],
        lineStyle: { color: tone.lineA, width: 1.4 },
      },
      {
        name: "MA10",
        type: "line",
        showSymbol: false,
        data: chartData?.ma.ma10 ?? [],
        lineStyle: { color: tone.lineB, width: 1.4 },
      },
      {
        name: "MA20",
        type: "line",
        showSymbol: false,
        data: chartData?.ma.ma20 ?? [],
        lineStyle: { color: tone.lineC, width: 1.2 },
      },
      {
        name: "MA60",
        type: "line",
        showSymbol: false,
        data: chartData?.ma.ma60 ?? [],
        lineStyle: { color: tone.lineD, width: 1.2 },
      },
      {
        name: "BOLL上轨",
        type: "line",
        showSymbol: false,
        data: chartData?.boll.upper ?? [],
        lineStyle: { color: tone.neutral, width: 1, type: "dashed" },
      },
      {
        name: "BOLL中轨",
        type: "line",
        showSymbol: false,
        data: chartData?.boll.middle ?? [],
        lineStyle: { color: tone.axis, width: 1, type: "dashed" },
      },
      {
        name: "BOLL下轨",
        type: "line",
        showSymbol: false,
        data: chartData?.boll.lower ?? [],
        lineStyle: { color: tone.neutral, width: 1, type: "dashed" },
      },
    ],
  };
}

function buildVolumeOption(): EChartsOption {
  const chartData = props.analysis?.analysis.charts;
  const tone = palette.value;

  return {
    animation: false,
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    grid: {
      left: 12,
      right: 12,
      top: 24,
      bottom: 14,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: chartData?.candles.map((item: CandlePoint) => item.date) ?? [],
      axisLine: { lineStyle: { color: tone.axis } },
      axisLabel: { color: tone.axis, show: false },
    },
    yAxis: {
      axisLabel: { color: tone.axis },
      splitLine: { lineStyle: { color: tone.split } },
    },
    series: [
      {
        type: "bar",
        data: chartData?.candles.map((item: CandlePoint) => item.volume) ?? [],
        itemStyle: {
          color: (params: { dataIndex: number }) => {
            const candle = chartData?.candles[params.dataIndex];
            return candle && candle.close >= candle.open ? tone.up : tone.down;
          },
        },
      },
    ],
  };
}

function buildMacdOption(): EChartsOption {
  const chartData = props.analysis?.analysis.charts;
  const tone = palette.value;

  return {
    animation: false,
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: {
      top: 0,
      textStyle: { color: tone.text },
    },
    grid: {
      left: 12,
      right: 12,
      top: 38,
      bottom: 14,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: chartData?.candles.map((item: CandlePoint) => item.date) ?? [],
      axisLine: { lineStyle: { color: tone.axis } },
      axisLabel: { color: tone.axis, show: false },
    },
    yAxis: {
      axisLabel: { color: tone.axis },
      splitLine: { lineStyle: { color: tone.split } },
    },
    series: [
      {
        name: "MACD",
        type: "bar",
        data: chartData?.macd.histogram ?? [],
        itemStyle: {
          color: (params: { value: unknown }) =>
            Number(params.value) >= 0 ? tone.up : tone.down,
        },
      },
      {
        name: "DIF",
        type: "line",
        showSymbol: false,
        data: chartData?.macd.dif ?? [],
        lineStyle: { color: tone.lineA, width: 1.4 },
      },
      {
        name: "DEA",
        type: "line",
        showSymbol: false,
        data: chartData?.macd.dea ?? [],
        lineStyle: { color: tone.lineC, width: 1.4 },
      },
    ],
  };
}

function buildRsiOption(): EChartsOption {
  const chartData = props.analysis?.analysis.charts;
  const tone = palette.value;
  const dates = chartData?.candles.map((item: CandlePoint) => item.date) ?? [];

  return {
    animation: false,
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    grid: {
      left: 12,
      right: 12,
      top: 24,
      bottom: 14,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: dates,
      axisLine: { lineStyle: { color: tone.axis } },
      axisLabel: { color: tone.axis, show: false },
    },
    yAxis: {
      min: 0,
      max: 100,
      axisLabel: { color: tone.axis },
      splitLine: { lineStyle: { color: tone.split } },
    },
    series: [
      {
        type: "line",
        showSymbol: false,
        smooth: true,
        data: chartData?.rsi ?? [],
        lineStyle: { color: tone.lineB, width: 1.6 },
        markLine: {
          silent: true,
          lineStyle: {
            color: tone.axis,
            type: "dashed",
          },
          data: [{ yAxis: 40 }, { yAxis: 60 }],
        },
      },
    ],
  };
}

function buildTurnoverOption(): EChartsOption {
  const turnoverData = props.analysis?.analysis.charts.turnover;
  const tone = palette.value;

  return {
    animation: false,
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: {
      top: 0,
      textStyle: { color: tone.text },
    },
    grid: {
      left: 12,
      right: 12,
      top: 38,
      bottom: 14,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: turnoverData?.dates ?? [],
      axisLine: { lineStyle: { color: tone.axis } },
      axisLabel: { color: tone.axis, show: false },
    },
    yAxis: {
      axisLabel: {
        color: tone.axis,
        formatter: "{value}%",
      },
      splitLine: { lineStyle: { color: tone.split } },
    },
    series: [
      {
        name: "当日换手率",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: turnoverData?.daily ?? [],
        lineStyle: { color: "#38bdf8", width: 1.8 },
      },
      {
        name: "MA5",
        type: "line",
        showSymbol: false,
        data: turnoverData?.ma5 ?? [],
        lineStyle: { color: tone.lineA, width: 1.4 },
      },
      {
        name: "MA10",
        type: "line",
        showSymbol: false,
        data: turnoverData?.ma10 ?? [],
        lineStyle: { color: tone.lineB, width: 1.4 },
      },
      {
        name: "MA20",
        type: "line",
        showSymbol: false,
        data: turnoverData?.ma20 ?? [],
        lineStyle: { color: tone.lineC, width: 1.2 },
      },
      {
        name: "MA60",
        type: "line",
        showSymbol: false,
        data: turnoverData?.ma60 ?? [],
        lineStyle: { color: tone.lineD, width: 1.2 },
      },
    ],
  };
}

function buildCapitalFlowOption(): EChartsOption {
  const capitalFlowData = props.analysis?.analysis.charts.capitalFlow;
  const tone = palette.value;

  return {
    animation: false,
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      valueFormatter: (value: unknown) => {
        if (value == null || Array.isArray(value)) {
          return "--";
        }
        return formatMoney(Number(value));
      },
    },
    legend: {
      top: 0,
      textStyle: { color: tone.text },
    },
    grid: {
      left: 12,
      right: 12,
      top: 38,
      bottom: 14,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: capitalFlowData?.dates ?? [],
      axisLine: { lineStyle: { color: tone.axis } },
      axisLabel: { color: tone.axis, show: false },
    },
    yAxis: {
      axisLabel: {
        color: tone.axis,
        formatter: (value: number) => formatMoneyCompact(value),
      },
      splitLine: { lineStyle: { color: tone.split } },
    },
    series: [
      {
        name: "主力净流向",
        type: "bar",
        data: capitalFlowData?.mainNetInflow ?? [],
        itemStyle: {
          color: (params: { value: unknown }) =>
            Number(params.value) >= 0 ? tone.up : tone.down,
        },
      },
      {
        name: "MA5",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: capitalFlowData?.ma5 ?? [],
        lineStyle: { color: tone.lineA, width: 1.4 },
      },
      {
        name: "MA10",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: capitalFlowData?.ma10 ?? [],
        lineStyle: { color: tone.lineC, width: 1.4 },
      },
    ],
  };
}

function renderCharts() {
  if (!props.analysis) {
    disposeCharts();
    return;
  }

  priceChart = initChart(priceChartRef.value, priceChart);
  volumeChart = initChart(volumeChartRef.value, volumeChart);
  macdChart = initChart(macdChartRef.value, macdChart);
  rsiChart = initChart(rsiChartRef.value, rsiChart);
  turnoverChart = initChart(turnoverChartRef.value, turnoverChart);
  capitalFlowChart = initChart(capitalFlowChartRef.value, capitalFlowChart);

  priceChart?.setOption(buildPriceOption(), true);
  volumeChart?.setOption(buildVolumeOption(), true);
  macdChart?.setOption(buildMacdOption(), true);
  rsiChart?.setOption(buildRsiOption(), true);
  turnoverChart?.setOption(buildTurnoverOption(), true);
  capitalFlowChart?.setOption(buildCapitalFlowOption(), true);
}

function handleResize() {
  priceChart?.resize();
  volumeChart?.resize();
  macdChart?.resize();
  rsiChart?.resize();
  turnoverChart?.resize();
  capitalFlowChart?.resize();
}

watch(
  () => [props.analysis, props.theme] as const,
  async () => {
    await nextTick();
    renderCharts();
  },
  { deep: true },
);

onMounted(async () => {
  await nextTick();
  renderCharts();
  window.addEventListener("resize", handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  disposeCharts();
});
</script>

<style scoped>
.analysis-section {
  display: grid;
  gap: 18px;
  margin-top: 20px;
}

.section-head,
.trend-hero,
.sideways-panel,
.chart-card,
.analysis-error,
.analysis-empty {
  backdrop-filter: blur(18px);
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  box-shadow: var(--panel-shadow);
}

.section-head,
.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.section-head {
  padding: 18px 22px;
  border-radius: 22px;
}

.section-kicker {
  margin: 0 0 6px;
  color: var(--accent-color);
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.section-head h3,
.panel-head h4 {
  margin: 0;
}

.analysis-refresh,
.analysis-error button {
  height: 42px;
  padding: 0 16px;
  border: 0;
  border-radius: 12px;
  color: #08111d;
  background: linear-gradient(135deg, #38bdf8, #0ea5e9);
  cursor: pointer;
}

.analysis-refresh:disabled,
.analysis-error button:disabled {
  opacity: 0.7;
  cursor: wait;
}

.analysis-error,
.analysis-empty {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 18px 22px;
  border-radius: 20px;
  color: var(--text-secondary);
}

.trend-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.9fr);
  gap: 16px;
  padding: 22px;
  border-radius: 24px;
}

.trend-result {
  padding: 20px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.04);
}

.trend-label {
  display: inline-flex;
  margin-bottom: 12px;
  color: var(--text-secondary);
}

.trend-result strong {
  display: block;
  font-size: clamp(2rem, 5vw, 3.6rem);
  line-height: 0.95;
}

.trend-result p {
  margin: 14px 0 0;
  color: var(--text-secondary);
}

.trend-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.summary-chip {
  display: grid;
  gap: 8px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
}

.summary-chip span,
.panel-head span,
.signal-card span {
  color: var(--text-secondary);
}

.summary-chip strong {
  font-size: 1.1rem;
}

.advice-card {
  display: grid;
  grid-column: span 2;
  gap: 12px;
  padding: 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.04);
}

.advice-head {
  display: grid;
  gap: 6px;
}

.advice-head strong {
  font-size: 1.5rem;
}

.advice-head em,
.advice-copy,
.advice-risk,
.advice-metrics span {
  color: var(--text-secondary);
  font-style: normal;
}

.advice-copy,
.advice-risk {
  margin: 0;
}

.advice-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.advice-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.advice-tag {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-secondary);
}

.signal-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.signal-card {
  display: grid;
  gap: 8px;
  min-height: 154px;
  padding: 18px;
  border-radius: 22px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  box-shadow: var(--panel-shadow);
}

.signal-card strong {
  font-size: 1.2rem;
}

.signal-card p,
.signal-card small {
  margin: 0;
  color: var(--text-secondary);
}

.tone-bullish {
  box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.22);
}

.tone-bearish {
  box-shadow: inset 0 0 0 1px rgba(74, 222, 128, 0.24);
}

.tone-neutral {
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.18);
}

.sideways-panel {
  display: grid;
  gap: 16px;
  padding: 20px 22px;
  border-radius: 24px;
}

.sideways-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.sideways-tag {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  color: var(--text-secondary);
  background: rgba(148, 163, 184, 0.12);
}

.sideways-tag.active {
  color: var(--text-primary);
  background: rgba(59, 130, 246, 0.2);
}

.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.chart-card {
  padding: 18px 20px 20px;
  border-radius: 24px;
}

.chart-large {
  grid-column: span 2;
}

.chart-canvas {
  height: 280px;
  margin-top: 16px;
}

.is-bullish {
  color: #f87171;
}

.is-bearish {
  color: #4ade80;
}

.is-neutral {
  color: var(--text-primary);
}

@media (max-width: 980px) {
  .trend-hero,
  .chart-grid,
  .signal-grid {
    grid-template-columns: 1fr;
  }

  .chart-large {
    grid-column: span 1;
  }
}

@media (max-width: 640px) {
  .section-head,
  .panel-head,
  .analysis-error,
  .analysis-empty {
    flex-direction: column;
    align-items: flex-start;
  }

  .trend-summary-grid {
    grid-template-columns: 1fr;
  }

  .advice-card,
  .advice-metrics {
    grid-column: span 1;
    grid-template-columns: 1fr;
  }
}
</style>

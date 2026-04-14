# 严格可信优先的数据接口与推荐算法设计

## 背景

当前看板已经具备实时行情、历史 K 线、换手率、主力资金、趋势分析和建议展示能力，但现状存在两个直接影响“实时性、真实性、合理性、可靠性”的问题：

- 行情与推荐缺少统一的数据质量门禁，数据过期、缺失或跨源冲突时仍可能输出方向性较强的结论；
- 主力资金存在“真实快照缺失时使用估算值兜底”的混用问题，容易让前端把估算值误读为真实资金流。

此外，当前推荐逻辑主要依赖启发式信号计数，缺少“质量优先、证据分层、降级透明、置信度有据”的统一设计。

## 目标

- 在现有工程结构内，建立“严格可信优先”的数据质量门禁；
- 对实时行情关键字段引入双源交叉校验，确保关键数据具有可解释的真实性依据；
- 将推荐算法改造成“质量门禁 -> 证据评分 -> 建议决策”的三层结构；
- 允许低置信建议，但必须显式说明降级原因与未通过项；
- 让接口直接返回数据质量、校验结果和证据拆解，支撑前端清晰展示；
- 明确异步、延时、轮询下的竞态处理要求，避免旧响应覆盖新结果。

## 非目标

- 不引入新的第三方 SDK、数据库或消息队列；
- 不扩展为自动交易、仓位管理或止盈止损策略系统；
- 不实现复杂的缓存基础设施或后台任务调度系统；
- 不对现有页面布局做无关重构；
- 不承诺“绝对真实”，而是把“真实性校验结果”透明输出给前端和用户。

## 方案选择

评估过三条路径：

- 方案 A：单源增强校验。改动最小，但真实性仍受单源限制；
- 方案 B：双源交叉校验 + 质量门禁 + 分层证据推荐；
- 方案 C：多源仲裁评分。严谨度最高，但延迟、复杂度和失败面显著上升。

最终采用方案 B，原因如下：

- 关键实时字段可以获得明确的交叉验证依据；
- 改动集中在现有 `server/quote.js`、`server/analysis.js`、`server/index.js`、`src/market-types.ts` 和看板展示层，符合最小改动原则；
- 可在不显著增加请求复杂度的前提下，把真实性、实时性和可靠性三个目标同时提升；
- 保留后续扩展到多源仲裁的空间。

## 设计总览

整体链路拆为四层：

1. 数据采集层：主源、备用源、历史源分别取数；
2. 数据校验层：新鲜度、完整性、一致性、真实性统一打分；
3. 分析决策层：趋势分析、证据评分、建议输出、降级处理；
4. 展示消费层：前端根据质量状态、证据拆解和建议结果做可解释呈现。

推荐结论不再直接由“指标倾向”产出，而是必须先经过数据质量门禁。

## 数据源策略

### 实时行情

- 主源：保留现有 QQ 行情接口；
- 备用源：启用现有新浪行情解析能力，用于关键字段交叉校验；
- 校验字段：`price`、`changePercent`、`volume`、`updatedAt`；
- 取数方式：主备并发请求，聚合层统一比对。

### 历史数据

- K 线：沿用腾讯历史 K 线；
- 换手率：沿用搜狐历史数据；
- 主力资金历史：沿用东方财富历史资金流；
- 主力资金快照：沿用东方财富实时快照。

### 真实性分层

- `verified`：主备关键字段校验通过，且数据未过期；
- `partial`：主源成功但备用源缺失或超时，仅能部分信任；
- `estimated`：仅存在推导或估算值，只能展示为辅助参考；
- `invalid`：关键字段缺失、冲突或过期，不可用于强结论。

## 接口契约调整

### `/api/quote`

从“只返回行情值”调整为“返回行情值 + 数据质量 + 校验证据”。

建议新增结构：

```ts
interface QuoteQuality {
  freshness: {
    status: "fresh" | "stale";
    maxAgeSeconds: 15;
    ageSeconds: number | null;
  };
  authenticity: {
    status: "verified" | "partial" | "invalid";
    primarySource: string;
    secondarySource: string | null;
    fallbackUsed: boolean;
  };
  completeness: {
    status: "complete" | "partial" | "invalid";
    missingFields: string[];
  };
  consistency: {
    status: "pass" | "warn" | "fail";
    mismatches: Array<{
      field: string;
      primary: number | string | null;
      secondary: number | string | null;
      tolerance: number | string;
    }>;
  };
  score: number;
  degraded: boolean;
  warnings: string[];
}
```

`QuoteData` 建议新增：

- `source`: 当前最终采用的数据源标记；
- `quality`: `QuoteQuality`；
- `verifiedAgainst`: 备用源名称或 `null`；
- `serverTime`: 服务端生成响应的时间戳。

### `/api/analysis`

在现有响应上新增统一的 `dataQuality` 与 `evidence`：

```ts
interface AnalysisQualityGate {
  status: "pass" | "degraded" | "blocked";
  score: number;
  degraded: boolean;
  blockingReasons: string[];
  warnings: string[];
}

interface EvidenceBreakdown {
  passedChecks: string[];
  failedChecks: string[];
  scoreBreakdown: Array<{
    key: string;
    group: "core" | "realtime" | "auxiliary";
    direction: "bullish" | "bearish" | "sideways" | "neutral";
    weight: number;
    score: number;
    reason: string;
  }>;
}
```

`analysis.advice` 建议扩展：

- `qualityGate`: `"pass" | "degraded" | "blocked"`；
- `confidenceReason`: 说明为何为高 / 中 / 低；
- `degradeReasons`: 降级原因列表；
- `evidenceSummary`: 核心证据摘要。

`analysis.indicators.capital` 建议拆分：

- `mainForceNetAmountReal`: 实时真实快照或 `null`；
- `mainForceNetAmountEstimated`: 估算值或 `null`；
- `mainForceSourceType`: `"verified" | "history_only" | "estimated" | "missing"`。

禁止继续用单一 `mainForceNetAmount` 混合真实值与估算值。

## 数据质量门禁

### 实时性规则

- 关键实时数据硬阈值为 `15 秒`；
- `quote.updatedAt` 与服务端当前时间差超过 15 秒，判定为 `stale`；
- `capitalSnapshot.updatedAt` 超过 15 秒，同样视为过期；
- 任一关键实时字段过期，`analysisQuality.status` 至少降为 `degraded`；
- 多个关键实时字段同时过期，`analysisQuality.status` 可直接降为 `blocked`。

### 真实性规则

主备行情采用容差校验：

- `price` 偏差 `<= 0.3%`；
- `changePercent` 偏差 `<= 0.2`；
- `volume` 偏差 `<= 8%`；
- `updatedAt` 差值 `<= 15 秒`。

判定规则：

- 全部通过：`authenticity = verified`；
- 仅部分通过或备用源超时：`authenticity = partial`；
- 关键字段冲突超阈值：`authenticity = invalid`。

### 完整性规则

以下任一命中，直接阻断趋势分析：

- 历史 K 线少于 60 条；
- 日期非递增或出现断档异常；
- 关键数值字段为 `NaN`、负值或非法格式；
- 行情关键字段缺失；
- 图表关键数组长度与日期轴不一致。

### 一致性规则

需要额外校验：

- 行情时间不能明显超前于服务端时间；
- 当前成交量不能明显小于已确认的同一时段成交量；
- 历史主力资金日期轴需要有序；
- 估算资金不得覆盖真实资金字段；
- 图表使用的数据与建议决策使用的数据必须来自同一轮分析结果。

## 推荐算法设计

### 总体结构

推荐算法改为三层：

1. 数据质量层：判断是否允许继续推荐；
2. 市场证据层：按权重和类别计算多空与横盘证据；
3. 决策层：结合质量状态与证据分输出动作、置信度和降级信息。

### 第一层：数据质量层

产出 `qualityScore`，区间为 `0-100`。

建议分档：

- `>= 85`：允许高置信建议；
- `70-84`：最多中置信；
- `50-69`：最多低置信；
- `< 50`：仅允许观望。

建议扣分项：

- 实时行情过期：`-25`；
- 资金快照过期：`-15`；
- 主备价格冲突：`-30`；
- 主备成交量冲突：`-15`；
- 备用源缺失：`-10`；
- 历史换手率缺失：`-5`；
- 实时资金仅估算：`-20`。

### 第二层：市场证据层

证据分为三组：

- 核心趋势证据：`MA`、`MACD`、`RSI`、突破 / 破位；
- 实时确认因子：量价关系、实时资金快照；
- 辅助因子：`BOLL`、横盘信号、换手率相对均值。

建议权重：

- 核心趋势证据：`55%`；
- 实时确认因子：`30%`；
- 辅助因子：`15%`。

这样可以保证实时因子只用于确认方向，而不是单独制造方向。

### 第三层：决策层

输出三个方向分值：

- `bullishScore`
- `bearishScore`
- `sidewaysScore`

决策规则：

- 若 `sidewaysScore` 高于阈值，优先输出 `观望`；
- 若核心趋势证据同向且 `bullishScore - bearishScore` 明显为正，允许 `买入`；
- 若核心趋势证据同向且 `bearishScore - bullishScore` 明显为正，允许 `卖出`；
- 核心证据不一致时，即使实时因子偏向单侧，也只能给出 `低置信` 或 `观望`。

### 低置信建议规则

允许低置信建议，但必须满足以下约束：

- 方向可见但证据不足；
- 质量门禁未阻断；
- 核心证据未完全冲突；
- 目标价和失效价能推导出合理方向。

典型低置信场景：

- 主源成功但备用源缺失；
- 资金快照缺失，仅有历史或估算值；
- 关键实时字段新鲜，但存在轻微跨源偏差；
- 趋势存在，但目标空间不够清晰。

此时输出：

- `action` 允许为 `买入`、`卖出` 或 `观望`；
- `confidence = 低`；
- `confidenceReason` 必须明确指出降级来源；
- `degradeReasons` 需要面向前端直出。

### 明确禁止项

- 不允许把估算资金值伪装为真实资金值；
- 不允许在关键实时字段过期且冲突时输出高置信买卖建议；
- 不允许因为单次 `changePercent` 为正或为负，就覆盖历史趋势主结论；
- 不允许在目标价或失效价方向不成立时保留强建议。

## 目标价与失效价

继续基于现有技术位推导，但增加质量门槛：

- 买入目标价：`BOLL 上轨`、近 20 日高点中的有效压力位；
- 卖出目标价：`BOLL 下轨`、近 20 日低点中的有效支撑位；
- 买入失效价：`MA20`、`BOLL 中轨`、近 20 日低点中的最近有效支撑；
- 卖出失效价：`MA20`、`BOLL 中轨`、近 20 日高点中的最近有效压力。

新增约束：

- 若候选位方向不成立，建议自动降级；
- 若空间不足，不允许强行输出目标价；
- 低置信建议仍需给出“为什么价位参考性不足”的说明。

## 异步与竞态设计

### 服务端

- 每次 `/api/analysis` 生成独立 `requestId`；
- 本轮分析的所有子步骤都绑定该 `requestId`；
- 聚合层只认本轮结果，不允许旧的延迟响应覆盖本轮产物；
- 不引入跨请求共享的半成品状态；
- 主备行情并发请求，历史数据与资金数据按现有结构并发拉取。

### 前端

- 前端轮询或手动刷新必须“只认最后一次请求”；
- 新请求发起后，旧请求响应到达时直接丢弃；
- 后续若加自动轮询，必须使用 `AbortController + requestId` 双保险；
- 组件卸载、切换标的、切换视图时必须清理未完成请求和唯一轮询实例。

### 事件与资源

- 不新增重复事件监听；
- 不新增多个并行轮询定时器；
- 图表渲染只消费当前最终分析结果；
- loading、error、degraded 三种状态必须可枚举、可退出、可恢复。

## 前端展示设计

前端需要新增质量展示层，而不是只展示建议结果。

### 顶部状态

建议在趋势结论或建议卡附近显示：

- `实时可信`
- `已降级`
- `低置信`
- `数据冲突`
- `估算参考`

### 建议卡

在现有 `advice` 卡片基础上新增：

- 质量门禁状态；
- 降级原因；
- 关键未通过项；
- 证据摘要。

### 资金展示

- 当真实快照存在时，突出显示真实值；
- 当仅有估算值时，明确标注“估算”；
- 当资金数据缺失时，不允许保留“净流入 / 净流出”的强语义文案。

## 测试与验证

### 服务端单元测试

需要扩展 `server/quote.test.js`：

- 主备行情解析均正常时，质量标记为 `verified`；
- 主备价格偏差超阈值时，质量标记为 `invalid`；
- 行情时间超过 15 秒时，质量标记为 `stale`；
- 备用源失败时，质量标记为 `partial` 且 `fallbackUsed = true`。

需要扩展 `server/analysis.test.js`：

- 数据质量分高时允许高 / 中置信建议；
- 数据过期时最多低置信；
- 关键跨源冲突时输出降级或观望；
- 仅有估算资金时不得输出“真实主力净流入”；
- 历史数据不足时阻断分析；
- 目标价 / 失效价不成立时自动降级；
- 横盘信号与趋势信号冲突时优先观望。

### 接口联调验证

- `/api/quote` 返回的 `quality.score`、`warnings`、`mismatches` 与实际场景一致；
- `/api/analysis` 返回的 `qualityGate`、`confidenceReason`、`degradeReasons` 可以直接驱动前端；
- 同一轮分析中图表数据、摘要结论和建议结论一致。

### 前端自测

- 正常场景下展示“实时可信”与正常建议；
- 过期场景下展示“已降级 / 低置信”；
- 冲突场景下展示具体校验失败项；
- 仅估算资金场景下，文案与标签准确；
- 切换标的、快速连续刷新时旧响应不会覆盖新结果。

## 防复现规则

本次识别到两个重复风险，需要固化为长期执行规则：

- 重复风险 1：估算值与真实值混用。所有估算字段必须带 `estimated` 语义，禁止复用真实字段名；
- 重复风险 2：未经过质量门禁直接输出方向建议。所有推荐输出必须先通过统一质量层，不允许绕过。

专项规则文件另存于：

- `docs/superpowers/rules/realtime-data-recommendation-rules.md`

## 实施边界

- 允许修改：`server/quote.js`、`server/analysis.js`、`server/index.js`、`server/*.test.js`、`src/market-types.ts`、`src/components/TrendDashboard.vue`
- 不新增第三方依赖；
- 不做无关重构；
- 不改变现有 watchlist、搜索、图表主题等无关逻辑。

## 验收标准

- 接口能明确区分“真实、部分可信、估算、无效”四种数据状态；
- 关键实时数据超过 15 秒时，建议自动降级；
- 主备行情关键字段冲突时，前端可见校验失败依据；
- 推荐结果具备质量门禁、证据拆解和置信度原因；
- 估算资金不再伪装成真实主力资金；
- 前端在低置信、降级、冲突场景下仍可展示且可恢复；
- 相关测试覆盖主路径与失败路径，异步链路无旧响应覆盖新状态问题。

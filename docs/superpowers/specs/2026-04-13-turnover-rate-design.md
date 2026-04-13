# 换手率与主力资金图表设计

## 背景

当前页面已经具备：

- 首页摘要中的当日行情展示
- `TrendDashboard.vue` 中的 K 线、成交量、MACD、RSI、BOLL 图表
- 服务端统一聚合的 `/api/quote` 与 `/api/analysis`

但仍存在两个问题：

1. 当日换手率原本长期显示 `--`
2. 趋势看板缺少“历史换手率对比”和“真实主力资金净流入/净流出”图表

此前在设计阶段，东方财富被视为换手率的首选来源；但在当前开发环境中，东方财富实时/历史换手率接口对 Node HTTPS 请求链路存在连接兼容问题，导致这次代码最终采用了可运行的兼容方案。由于用户更认可东方财富数据质量，因此本设计需要明确区分：

- `首选数据方案`
- `当前兼容落地方案`

避免文档把“暂时可运行”误写成“长期最优”。

## 目标

- 首页摘要展示真实当日换手率
- 在 `TrendDashboard.vue` 新增“换手率对比”图
- 在 `TrendDashboard.vue` 新增“主力资金净流入/净流出”图
- 保持现有轮询、请求并发控制、组件结构和 ECharts 生命周期模式不变
- 以最小改动完成需求，不扩散到无关页面、状态管理和依赖体系

## 非目标

- 不重写现有 K 线、MACD、RSI、BOLL 趋势判断逻辑
- 不新增前端全局状态管理
- 不新增前端轮询定时器
- 不引入新的第三方依赖
- 不把资金分析重构成独立页面或模块

## 数据策略

## 首选方案

从长期口径与数据偏好上，首选方案统一为东方财富：

- 实时当日换手率：东方财富实时行情
- 历史每日换手率：东方财富历史日线
- 历史主力资金净流入/净流出：东方财富资金流向数据链

采用这一方案的原因：

- 用户更认可东方财富数据
- 换手率与资金流向可尽量保持同源
- 后续若环境允许，可减少跨源口径差异

## 当前兼容落地方案

考虑当前开发环境的实际可访问性，本次代码落地采用如下兼容方案：

- 实时当日换手率：`QQ quote`
- 历史每日换手率：`搜狐 hisHq`
- 历史主力资金净流入/净流出：东方财富资金流向页面背后的数据链

设计要求如下：

- spec 中明确“东方财富是首选方案”
- 同时明确“当前实现采用 QQ + 搜狐 + 东方财富资金流”的兼容组合
- 后续一旦东方财富换手率接口在运行环境中恢复稳定，允许无感切回首选方案

## 当前实现为何采用兼容方案

当前环境下已验证：

- 东方财富实时/历史换手率接口通过 Node HTTPS 请求时存在断连问题
- `QQ quote` 在当前环境可访问，且包含实时换手率字段
- `搜狐 hisHq` 在当前环境可访问，且包含历史换手率列
- 东方财富资金流向 H5 页面在当前环境可访问，且脚本中存在真实历史主力资金数据链

因此，本设计不把 `QQ + 搜狐` 视为长期优先，只把它视为“当前环境下的兼容落地实现”。

## 返回结构设计

## 类型扩展

在 `src/market-types.ts` 中扩展趋势分析返回结构，保留单一 `TrendAnalysisPayload` 输入，不新增额外页面级状态类型。

需要新增或保留的字段包括：

- `analysis.indicators.capital.turnoverRatePercent`
- `analysis.indicators.capital.mainForceNetAmount`
- `analysis.indicators.capital.mainForceDirection`
- `analysis.charts.turnover`
- `analysis.charts.capitalFlow`

其中：

```ts
turnover: {
  dates: string[];
  daily: Array<number | null>;
  ma5: Array<number | null>;
  ma10: Array<number | null>;
  ma20: Array<number | null>;
  ma60: Array<number | null>;
}

capitalFlow: {
  dates: string[];
  mainNetInflow: Array<number | null>;
  ma5: Array<number | null>;
  ma10: Array<number | null>;
}
```

说明：

- `turnover` 用于换手率图
- `capitalFlow` 用于历史主力资金图
- `mainNetInflow` 为正表示净流入，为负表示净流出

## 服务端设计

## `server/quote.js`

目标：

- 让 `/api/quote` 返回真实 `turnoverRatePercent`

首选方案：

- 使用东方财富实时行情字段提供换手率

当前兼容落地：

- 使用 `QQ quote` 实时串解析换手率
- 对成交量和成交额做单位对齐：
  - 成交量：手 -> 股
  - 成交额：万 -> 元

要求：

- `quote.turnoverRatePercent` 统一按百分比数值返回，例如 `2.27` 表示 `2.27%`
- 若字段缺失但其它核心字段完整，可回退为 `null`
- 其它关键行情字段继续保持严格校验

## `server/analysis.js`

目标：

- 拉取历史每日换手率
- 拉取历史主力净流入/净流出
- 计算换手率均线和主力资金均线
- 将结果挂入 `analysis.charts.turnover` 与 `analysis.charts.capitalFlow`

### 历史换手率

首选方案：

- 使用东方财富历史日线换手率

当前兼容落地：

- 使用 `搜狐 hisHq` JSONP
- 仅提取：
  - `date`
  - `turnoverRatePercent`

新增纯函数：

- `parseSohuHistoryJsonp(rawText)`
- `buildTurnoverChart(rows)`

### 历史主力资金

首选方案与当前兼容落地在这次设计中保持一致，均优先走东方财富资金流向数据链。

已确认的线索：

- 页面：`https://emdata.eastmoney.com/zjlx/stock.html`
- 当日资金概览数据集：`RPT_FUNDFLOW_SECUCODE`
- 个股历史资金数据集：`RPT_DMSK_TS_FUNDFLOWHIS`

本次设计要求：

- 新增 `fetchCapitalFlowHistoryBySymbol()`
- 新增 `parseCapitalFlowHistoryPayload()`
- 新增 `buildCapitalFlowChart()`

历史主力资金图至少提取：

- `date`
- `close`
- `changePercent`
- `mainNetInflow`

并生成：

- `mainNetInflow`
- `ma5`
- `ma10`

### 聚合策略

`fetchAnalysisBySymbol()` 统一并发拉取：

- `quote`
- `bars`
- `turnoverRows`
- `capitalFlowRows`

要求：

- 只通过一次 `/api/analysis` 返回给前端
- 不新增前端额外并发请求
- 换手率图与主力资金图各自使用自己的日期轴，禁止靠数组下标强行对齐

## 前端展示设计

## `App.vue`

首页摘要中的“换手率”继续读取：

- `quote.turnoverRatePercent`

不改模板结构，不新增 watcher 或额外请求。

## `TrendDashboard.vue`

在现有 `.chart-grid` 中保留并展示：

1. `换手率对比`
2. `主力资金净流入/净流出`

### 换手率图

标题：

- `换手率对比`

副标题：

- `当日与 5 / 10 / 20 / 60 日均线`

展示内容：

- `daily`
- `ma5`
- `ma10`
- `ma20`
- `ma60`

表现形式：

- 折线图
- `daily` 作为主线更醒目
- 四条均线沿用当前图表色板
- 不显示 symbol 点

### 主力资金图

标题：

- `主力资金净流入/净流出`

副标题：

- `真实历史主力资金与 5 / 10 日均线`

展示内容：

- `mainNetInflow`
- `ma5`
- `ma10`

表现形式：

- 柱状图 + 均线
- 正值显示净流入
- 负值显示净流出
- `MA5 / MA10` 用平滑折线叠加

原因：

- 柱状图比折线更容易识别净流入/净流出的方向切换
- 同时保留均线，可减少单日资金噪音

### 当前摘要区口径

摘要区中的：

- `mainForceNetAmount`
- `mainForceDirection`

后续应优先切换为“真实最近交易日主力资金”口径，避免继续长期使用估算值。

若本次实现阶段暂时保留估算值，则必须在文档和代码注释中明确：

- 摘要为估算口径
- 历史图为真实口径

优先目标仍是尽快统一为真实口径。

## 异步与稳定性

本次新增的是服务端数据源和图表，不新增前端轮询与额外事件源，因此重点风险仍在请求聚合与渲染生命周期。

要求如下：

- 保持现有 `fetchQuote()` 的 `requestId + AbortController` 并发控制逻辑不变
- 保持现有 `fetchAnalysis()` 的 `requestId + AbortController` 并发控制逻辑不变
- 切换标的时，旧分析响应不得覆盖新的换手率图或资金图状态
- 换手率与资金图必须纳入同一次 `fetchAnalysisBySymbol()` 聚合
- 继续复用 `TrendDashboard.vue` 现有 `watch(() => [props.analysis, props.theme])` 渲染节奏
- 图表实例增加后，仍必须统一在同一组件销毁路径中 `dispose()`

因此改造后原则上：

- 定时器数量不变
- 事件监听数量不变
- 图表实例数量增加，但不新增监听泄漏风险
- 旧请求覆盖新状态的保护逻辑继续有效

## 边界与异常处理

## 数据缺失

- 当日换手率缺失时，首页与分析页展示 `--`
- 历史换手率为空时，不影响现有趋势判断主流程
- 历史主力资金为空时，不影响换手率图、K 线和技术指标
- 若换手率条数不足 5 / 10 / 20 / 60，对应均线前段返回 `null`
- 若主力资金条数不足 5 / 10，对应均线前段返回 `null`

## 接口失败

- `/api/quote` 失败时，继续按现有错误路径返回，由前端展示错误 banner
- `/api/analysis` 中若换手率或主力资金任一子链路失败，应优先返回可识别的空图数据而不是伪造数值
- 不在前端偷偷兜底假数据
- 不因新增图表导致整个看板卡死在 loading

## 数据合法性

- 换手率按百分比数值返回，例如 `2.53` 表示 `2.53%`
- 主力资金净流入按金额数值返回，正负号保留方向语义
- 服务端统一负责单位换算与精度控制
- 前端只负责格式化显示，不重复换算口径

## 测试方案

至少补充以下测试：

## `server/quote.test.js`

- `QQ quote` 实时换手率解析正确
- 成交量与成交额单位换算正确
- 关键字段缺失时仍按预期报错

## `server/analysis.test.js`

- `搜狐 hisHq` 历史换手率解析成功
- 换手率 `MA5 / MA10 / MA20 / MA60` 计算正确
- 历史主力资金解析成功
- 主力资金 `MA5 / MA10` 计算正确
- 趋势判断逻辑不因新增两张图而改变
- 返回结构中同时包含 `analysis.charts.turnover` 与 `analysis.charts.capitalFlow`

## 前端验证

- `TrendDashboard.vue` 在 `analysis` 切换、主题切换、窗口 resize 后所有图表都能正常渲染
- 卸载组件时新增图表实例能被正确 `dispose()`
- 当 `analysis` 为空、加载中、报错或局部图表无数据时，不出现空 DOM 初始化报错

## 实施边界

- 允许修改：
  - `server/quote.js`
  - `server/quote.test.js`
  - `server/analysis.js`
  - `server/analysis.test.js`
  - `src/market-types.ts`
  - `src/components/TrendDashboard.vue`
  - `docs/superpowers/specs/2026-04-13-turnover-rate-design.md`
- 如确有必要，可只对 `src/App.vue` 做最小展示修正
- 不修改：
  - 现有目录结构
  - 依赖清单
  - 轮询周期
  - 其它无关组件与样式文件

## 验收标准

- 首页“换手率”展示真实当日换手率，不再长期显示 `--`
- `TrendDashboard.vue` 中存在“换手率对比”图
- `TrendDashboard.vue` 中存在“主力资金净流入/净流出”图
- 换手率图中可看到最近一段时间每日换手率与 `MA5 / MA10 / MA20 / MA60`
- 主力资金图中可看到真实主力净流入/净流出柱状序列与 `MA5 / MA10`
- 切换标的、手动刷新、自动轮询时不出现旧数据覆盖新数据的问题
- 不新增事件泄漏、重复监听、图表实例残留或 loading 无法退出的问题
- 相关测试通过，且无新增构建错误

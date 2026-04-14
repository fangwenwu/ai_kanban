export interface QuoteQualityMismatch {
  field: string;
  primary: number | string | null;
  secondary: number | string | null;
  tolerance: number | string;
}

export interface QuoteQuality {
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
    mismatches: QuoteQualityMismatch[];
  };
  score: number;
  degraded: boolean;
  warnings: string[];
}

export interface QuoteData {
  symbol: string;
  name: string;
  price: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;
  amplitudePercent: number;
  turnoverRatePercent: number | null;
  updatedAt: string;
  source: string;
  verifiedAgainst: string | null;
  serverTime: string;
  quality: QuoteQuality;
}

export interface AnalysisQualityGate {
  status: "pass" | "degraded" | "blocked";
  score: number;
  degraded: boolean;
  blockingReasons: string[];
  warnings: string[];
}

export interface EvidenceBreakdownItem {
  key: string;
  group: "core" | "realtime" | "auxiliary";
  direction: "bullish" | "bearish" | "sideways" | "neutral";
  weight: number;
  score: number;
  reason: string;
}

export interface TrendAnalysisPayload {
  symbol: string;
  quote: QuoteData;
  analysis: {
    trendLabel: string;
    summary: string;
    sidewaysSignals: string[];
    dataQuality: AnalysisQualityGate;
    evidence: {
      passedChecks: string[];
      failedChecks: string[];
      scoreBreakdown: EvidenceBreakdownItem[];
    };
    advice: {
      action?: "买入" | "卖出" | "观望";
      confidence?: "高" | "中" | "低";
      qualityGate?: "pass" | "degraded" | "blocked";
      confidenceReason?: string;
      degradeReasons?: string[];
      evidenceSummary?: string[];
      targetPrice?: number | null;
      stopPrice?: number | null;
      holdingWindow?: string;
      reasonTags?: string[];
      rationale?: string;
      riskNote?: string;
    };
    indicators: {
      ma: {
        state: string;
        bias: string;
        value: number[];
        detail: string;
      };
      macd: {
        state: string;
        bias: string;
        zeroAxis: string;
        value: {
          dif: number;
          dea: number;
          macd: number;
        };
      };
      boll: {
        state: string;
        position: string;
        value: {
          upper: number;
          middle: number;
          lower: number;
          widthPercent: number;
        };
      };
      rsi: {
        state: string;
        bias: string;
        value: number;
      };
      volume: {
        state: string;
        relation: string;
        volumeRatio: number;
        averageVolume: number;
      };
      pattern: {
        candleType: string;
        pattern: string;
      };
      capital: {
        turnoverRatePercent: number | null;
        mainForceNetAmount: number;
        mainForceDirection: string;
        mainForceNetAmountReal: number | null;
        mainForceNetAmountEstimated: number | null;
        mainForceSourceType:
          | "verified"
          | "history_only"
          | "estimated"
          | "missing";
      };
    };
    charts: {
      candles: Array<{
        date: string;
        open: number;
        close: number;
        high: number;
        low: number;
        volume: number;
      }>;
      ma: {
        ma5: Array<number | null>;
        ma10: Array<number | null>;
        ma20: Array<number | null>;
        ma60: Array<number | null>;
      };
      macd: {
        dif: number[];
        dea: number[];
        histogram: number[];
      };
      boll: {
        upper: Array<number | null>;
        middle: Array<number | null>;
        lower: Array<number | null>;
      };
      rsi: Array<number | null>;
      turnover: {
        dates: string[];
        daily: Array<number | null>;
        ma5: Array<number | null>;
        ma10: Array<number | null>;
        ma20: Array<number | null>;
        ma60: Array<number | null>;
      };
      capitalFlow: {
        dates: string[];
        mainNetInflow: Array<number | null>;
        ma5: Array<number | null>;
        ma10: Array<number | null>;
      };
    };
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

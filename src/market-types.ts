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
}

export interface TrendAnalysisPayload {
  symbol: string;
  quote: QuoteData;
  analysis: {
    trendLabel: string;
    summary: string;
    sidewaysSignals: string[];
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

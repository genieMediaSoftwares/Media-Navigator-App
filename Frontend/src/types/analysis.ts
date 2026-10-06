// Data contracts for the analysis endpoints (/api/intelligence/dashboard, /timing, /performers,
// /trends, /media/:id/performance-analysis, /media/:id/video-analysis, /api/accounts/:id/sync-status).
// Every number is computed by the server from synced platform data; `null` means the platform did not
// provide the value and must render as "Not available", never as 0. AI fields are interpretation and
// are always shown with an AI label.

import type { ContentFormat, IntelligenceAccount, IntelligencePost, MetricDefinitions } from './api';

export type SyncState = 'never' | 'syncing' | 'completed' | 'partial' | 'failed';

export interface SyncStatusSummary {
  state: SyncState;
  lastSyncedAt: string | null;
  lastFullSyncAt: string | null;
  storedCount: number;
  profileMediaCount: number | null;
  lastRun: {
    status: 'running' | 'completed' | 'partial' | 'failed';
    mode: 'full' | 'incremental';
    startedAt: string;
    completedAt: string | null;
    itemsFetched: number;
    newItems: number;
    pagesFetched: number;
    reachedEnd: boolean;
    errorCode: string | null;
    errorMessage: string | null;
  } | null;
  autoSyncIntervalMs: number | null;
  notes: string[];
}

export type ScoreMetric = 'views' | 'reach' | 'likes' | 'comments' | 'shares' | 'saves' | 'engagementRate';

export interface ScoredPost extends IntelligencePost {
  /** 0–100 percentile-based performance score; null when no metric is available. */
  score: number | null;
  scoreBasis: ScoreMetric[];
  /** Reels average watch time (ms) from Instagram; null when not returned. */
  avgWatchTimeMs: number | null;
}

export interface MetricTotal {
  total: number | null;
  /** Mean per post. */
  average: number | null;
  /** Median per post: the typical post, not lifted by a few viral ones. */
  median: number | null;
  postsWithData: number;
}

export interface DashboardSummary {
  totalPosts: number;
  views: MetricTotal;
  likes: MetricTotal;
  comments: MetricTotal;
  shares: MetricTotal;
  saves: MetricTotal;
  reach: MetricTotal;
  engagementRate: { average: number | null; median: number | null; postsWithData: number };
  bestPost: ScoredPost | null;
}

/** The typical (median) post of each period. */
export interface TrendPoint {
  periodStart: string;
  posts: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  engagementRate: number | null;
  score: number | null;
}

export interface FrequencyBucket {
  label: string;
  weeks: number;
  posts: number;
  avgScore: number | null;
  typicalViewsPerPost: number | null;
  typicalInteractionsPerPost: number | null;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface MetricLift {
  metric: 'views' | 'likes' | 'engagementRate' | 'interactions';
  /** Median per post in the slot vs across all analyzed posts. */
  groupMedian: number;
  accountMedian: number;
  ratio: number;
}

export interface TimingSlot {
  postCount: number;
  avgScore: number;
  hitRate: number;
  lifts: MetricLift[];
}

export interface PostingRecommendation {
  sufficient: boolean;
  timezone: string;
  postsAnalyzed: number;
  minimumRequired: number;
  accountAvgScore: number | null;
  bestDay: (TimingSlot & { dayOfWeek: number; label: string }) | null;
  bestTime: (TimingSlot & { startHour: number; endHour: number; label: string }) | null;
  bestSlot: (TimingSlot & { dayOfWeek: number; startHour: number; endHour: number; label: string }) | null;
  strongMetrics: string[];
  confidence: Confidence;
  why: string[];
}

export interface Evidence {
  label: string;
  value: string;
}

export interface PriorityTask {
  id: string;
  priority: number;
  title: string;
  impact: 'high' | 'medium' | 'low';
  reason: string;
  supportingData: Evidence[];
  action: string;
  trendId: string | null;
}

export interface AccountLevelValue {
  value: number;
  period: string | null;
  date: string | null;
}

export interface Dashboard {
  account: IntelligenceAccount;
  followers: number | null;
  sync: SyncStatusSummary;
  summary: DashboardSummary;
  trend: { granularity: 'week' | 'month'; points: TrendPoint[] };
  frequency: FrequencyBucket[];
  recommendation: PostingRecommendation;
  tasks: PriorityTask[];
  accountInsights: { reach: AccountLevelValue | null; views: AccountLevelValue | null; accountsEngaged: AccountLevelValue | null };
  scoreDefinition: string;
  definitions: MetricDefinitions;
  aiConfigured: boolean;
}

export interface DashboardResponse {
  accounts: IntelligenceAccount[];
  dashboard: Dashboard | null;
}

export type HeatmapMetric = 'score' | 'views' | 'likes' | 'engagementRate' | 'interactions';

export interface HeatmapCell {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  postCount: number;
  /** Median per post in the cell. */
  median: number;
  intensity: number;
}

export interface MetricHeatmap {
  metric: HeatmapMetric;
  sufficient: boolean;
  postsAnalyzed: number;
  minimumRequired: number;
  cells: HeatmapCell[];
  byDay: Array<{ dayOfWeek: number; postCount: number; median: number }>;
  byHour: Array<{ startHour: number; endHour: number; postCount: number; median: number }>;
}

export interface TimingResponse {
  account: IntelligenceAccount;
  recommendation: PostingRecommendation;
  heatmaps: Record<HeatmapMetric, MetricHeatmap>;
}

export type ReasonArea = 'views' | 'engagement' | 'format' | 'shares_saves' | 'comments' | 'timing' | 'caption' | 'hashtags' | 'watch_time' | 'topic';

export interface ObservedReason {
  id: string;
  area: ReasonArea;
  direction: 'positive' | 'negative';
  statement: string;
  magnitude: number;
}

export interface Improvement {
  area: ReasonArea;
  action: string;
  basis: string;
}

export interface PerformerItem {
  post: ScoredPost & { tier?: IntelligencePost['tier']; vsTypicalPercent?: number | null };
  reasons: ObservedReason[];
  improvements: Improvement[];
  vsAccount: { viewsPercent: number | null; likesPercent: number | null; engagementRatePercent: number | null; scorePoints: number | null };
  isVideo: boolean;
}

export type PerformerType = 'top' | 'improve';

export interface PerformersPage {
  type: PerformerType;
  sufficient: boolean;
  minimumRequired: number;
  total: number;
  items: PerformerItem[];
  nextOffset: number | null;
  /** The typical (median) post the comparisons are measured against. */
  typicalPost: { views: number | null; likes: number | null; engagementRate: number | null };
  scoreDefinition: string;
  aiConfigured: boolean;
}

export interface DetectedTrend {
  id: string;
  category: 'format' | 'format_momentum' | 'momentum' | 'caption' | 'hashtags' | 'length' | 'topic' | 'timing' | 'watch_time' | 'frequency';
  direction: 'up' | 'down';
  headline: string;
  recommendation: string;
  ratio: number;
  metric: string;
  sampleSize: number;
  comparisonSize: number;
  confidence: Confidence;
  evidence: Evidence[];
  format?: ContentFormat;
  topic?: string;
}

export interface TrendsResponse {
  account: IntelligenceAccount;
  postsAnalyzed: number;
  sufficient: boolean;
  minimumRequired: number;
  trends: DetectedTrend[];
  unavailable: Array<{ topic: string; reason: string }>;
  tasks: PriorityTask[];
  recommendation: PostingRecommendation;
  aiConfigured: boolean;
}

export interface AiTrendInterpretation {
  summary: string;
  interpretations: Array<{ trendId: string; interpretation: string; recommendation: string }>;
  opportunities: Array<{ title: string; rationale: string; suggestion: string; trendIds: string[] }>;
  generatedAt: string;
}

export interface AiReason {
  title: string;
  detail: string;
  area: string;
}

export interface PerformanceAnalysisResponse {
  observed: { reasons: ObservedReason[]; improvements: Improvement[] };
  ai: {
    kind: PerformerType;
    summary: string;
    reasons: AiReason[];
    improvements: Array<{ action: string; why: string }>;
    cannotConfirm: string[];
    usedCoverImage: boolean;
    generatedAt: string;
  };
}

/** The typical (median) post of a comparison group. */
export interface ComparisonSet {
  postCount: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  engagementRate: number | null;
  score: number | null;
}

export interface PostComparisons {
  account: ComparisonSet;
  similar: ComparisonSet & { format: ContentFormat };
  best: ComparisonSet;
}

/** `analysis` block of GET /api/intelligence/media/:id. */
export interface PostAnalysisBlock {
  score: number | null;
  scoreBasis: ScoreMetric[];
  avgWatchTimeMs: number | null;
  kind: PerformerType | null;
  reasons: ObservedReason[];
  improvements: Improvement[];
  comparisons: PostComparisons;
  isVideo: boolean;
  scoreDefinition: string;
}

export interface VideoAnalysisResponse {
  observed: {
    metrics: IntelligencePost['metrics'];
    engagementRate: number | null;
    score: number | null;
    avgWatchTimeMs: number | null;
    comparisons: PostComparisons;
  };
  aiConfigured: boolean;
  ai: {
    summary: string;
    hook: { opening: string; strength: 'strong' | 'moderate' | 'weak'; topicClearQuickly: boolean; assessment: string };
    structure: { intro: string; mainContent: string; pacing: string; transitions: string; story: string; endingCta: string };
    visual: { framing: string; textOverlays: string; clarity: string; sceneChanges: string; branding: string; cover: string };
    engagement: { whyViewersWatched: string; shareability: string; saveability: string; commentPotential: string; ctaEffectiveness: string };
    keyMoments: Array<{ timestamp: string; note: string }>;
    recommendations: string[];
    cannotAssess: string[];
    generatedAt: string;
  } | null;
}

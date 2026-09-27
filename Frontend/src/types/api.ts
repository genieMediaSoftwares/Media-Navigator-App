// Data contracts for Media Navigator Worker responses (the `data` field of the envelope).
// Type definitions only: every value the app renders must come from the API.
// Dates are ISO 8601 strings. Scores are 0–100 unless noted. Nullable fields mean "not provided
// by the platform/backend" and must be rendered as unavailable, never guessed.

export type SocialPlatform = 'instagram' | 'youtube' | 'linkedin' | 'facebook';

/** 0 = Monday … 6 = Sunday */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ---- Users -------------------------------------------------------------

export interface Profile {
  displayName: string;
  /** R2 object key; null until the user uploads an avatar. */
  avatarKey: string | null;
}

export interface User {
  id: string;
  email: string;
  profile: Profile | null;
}

// ---- Accounts (GET /api/accounts, POST /api/accounts/connect) -----------

export type ConnectionStatus = 'connected' | 'reauthorization_required' | 'error';

export interface ConnectedAccount {
  id: string;
  platform: SocialPlatform;
  handle: string;
  displayName: string | null;
  profilePictureUrl?: string | null;
  status: ConnectionStatus;
  connectedAt: string;
  lastSyncedAt: string | null;
}

export interface AccountsResponse {
  accounts: ConnectedAccount[];
}

export interface ConnectAccountResult {
  /** Platform OAuth URL to open in the browser. */
  authorizationUrl: string;
}

export interface SyncSummary {
  accountId: string;
  postsSynced: number;
  metricsSynced: number;
  lastSyncedAt: string;
}

export interface InstagramDashboardMetrics {
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
  reach: number | null;
  impressions: number | null;
  engagementRate: number | null;
}

export interface InstagramDashboardPost {
  id: string;
  providerMediaId: string;
  mediaType: string | null;
  mediaProductType: string | null;
  caption: string | null;
  permalink: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  timestamp: string | null;
  likeCount: number | null;
  commentsCount: number | null;
  reach: number | null;
  impressions: number | null;
  engagementRate: number | null;
}

export interface InstagramDashboardData {
  account: {
    id: string;
    platform: 'instagram';
    handle: string;
    displayName: string | null;
    profilePictureUrl: string | null;
    status: ConnectionStatus;
    connectedAt: string;
    lastSyncedAt: string | null;
  };
  metrics: InstagramDashboardMetrics;
  posts: InstagramDashboardPost[];
  lastSyncRun: {
    status: 'running' | 'completed' | 'failed';
    startedAt: string;
    completedAt: string | null;
    itemsFetched: number;
    errorMessage: string | null;
  } | null;
}

// ---- Home overview (GET /api/overview) ----------------------------------

export type SignalTone = 'positive' | 'neutral' | 'attention';

export interface HeroSignal {
  title: string;
  summary: string;
  tone: SignalTone;
  generatedAt: string;
}

export interface ChannelSummary {
  accountId: string;
  platform: SocialPlatform;
  handle: string;
  followers: number | null;
  /** Percent change over `period`, e.g. 4.2 means +4.2%. */
  followersChangePercent: number | null;
  /** Percent, e.g. 3.1 means 3.1%. */
  engagementRate: number | null;
}

export interface QuickInsight {
  id: string;
  label: string;
  value: number;
  unit: 'count' | 'percent';
  changePercent: number | null;
  /** Human-readable period supplied by the backend, e.g. "Last 7 days". */
  period: string;
}

export interface HomeOverview {
  accounts: ConnectedAccount[];
  heroSignal: HeroSignal | null;
  channels: ChannelSummary[];
  insights: QuickInsight[];
}

// ---- Intelligence (/api/intelligence/*) ----------------------------------
// Every number is computed by the Worker from synced Meta data. `null` means Instagram did not
// provide the value: render "Not available", never 0.

export type ContentFormat = 'REEL' | 'POST' | 'CAROUSEL' | 'VIDEO' | 'STORY';

export interface IntelligenceAccount {
  id: string;
  platform: SocialPlatform;
  handle: string;
  displayName: string | null;
  profilePictureUrl: string | null;
  status: ConnectionStatus;
  lastSyncedAt: string | null;
}

export interface IntelligencePostMetrics {
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  totalInteractions: number | null;
}

export interface IntelligencePost {
  id: string;
  format: ContentFormat;
  caption: string | null;
  permalink: string | null;
  previewUrl: string | null;
  publishedAt: string | null;
  metrics: IntelligencePostMetrics;
  /** likes + comments */
  interactions: number | null;
  /** Percent */
  engagementRate: number | null;
  /** Percent difference from the account average interactions per post. */
  vsBaselinePercent: number | null;
}

export interface FormatPerformance {
  format: ContentFormat;
  count: number;
  avgViews: number | null;
  viewsSampleSize: number;
  avgLikes: number | null;
  avgComments: number | null;
  avgInteractions: number | null;
  avgEngagementRate: number | null;
}

export interface AccountLevelMetric {
  value: number;
  period: string | null;
  date: string | null;
}

export interface TimingWindow {
  dayOfWeek: DayOfWeek;
  startHour: number;
  endHour: number;
  score: number;
  postCount: number;
  avgInteractions: number;
}

export interface MetricDefinitions {
  interactions: string;
  engagementRate: string;
  baseline: string;
  vsBaseline: string;
  views: string;
  needsAttention: string;
  populations: string;
}

export interface IntelligenceOverview {
  account: IntelligenceAccount;
  summary: {
    followers: number | null;
    following: number | null;
    profileMediaCount: number | null;
    avgInteractions: number | null;
    avgEngagementRate: number | null;
    totalViews: number | null;
    viewsAvailableCount: number;
    reach: AccountLevelMetric | null;
    impressions: AccountLevelMetric | null;
  };
  baseline: {
    /** Mean interactions per post (the "vs average" comparison point). */
    avgInteractions: number | null;
    /** Median interactions per post: what a typical post gets. */
    medianInteractions: number | null;
    sampleSize: number;
  };
  archive: {
    syncedCount: number;
    profileMediaCount: number | null;
    formatCounts: { format: ContentFormat; count: number }[];
    totalViews: number | null;
    viewsAvailableCount: number;
    totalInteractions: number | null;
    avgEngagementRate: number | null;
    oldestPublishedAt: string | null;
    newestPublishedAt: string | null;
  };
  formats: FormatPerformance[];
  ranking: {
    sufficient: boolean;
    minimumRequired: number;
    working: IntelligencePost[];
    attention: IntelligencePost[];
  };
  timing: {
    timezone: string;
    sufficient: boolean;
    postsAnalyzed: number;
    minimumRequired: number;
    strongestWindow: TimingWindow | null;
  };
  lastSyncRun: {
    status: 'running' | 'completed' | 'failed';
    startedAt: string;
    completedAt: string | null;
    itemsFetched: number;
    errorMessage: string | null;
  } | null;
  aiConfigured: boolean;
  definitions: MetricDefinitions;
}

export interface IntelligenceOverviewResponse {
  accounts: IntelligenceAccount[];
  /** null when no Instagram account is connected. */
  overview: IntelligenceOverview | null;
}

export interface SupportingPost {
  id: string;
  format: ContentFormat;
  caption: string | null;
  previewUrl: string | null;
  publishedAt: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  engagementRate: number | null;
  vsBaselinePercent: number | null;
}

/** Rebuilt by the Worker from stored data; never written by the AI model. */
export interface SupportingData {
  posts: SupportingPost[];
  formats: FormatPerformance[];
}

export type InsightType = 'pattern' | 'growth' | 'timing' | 'format' | 'risk';

/** Produced by the Worker (which calls Gemini); never generated on the device. */
export interface AiInsight {
  id: string;
  type: InsightType;
  title: string;
  /** AI-written summary of what the data shows. */
  observation: string;
  supportingData: SupportingData;
  /** AI hypothesis, not a verified cause. */
  explanation: string;
  recommendation: string;
  expectedMeasurement: string;
}

export interface AiInsightsResult {
  insights: AiInsight[];
  generatedAt: string;
}

export interface MediaPage {
  items: IntelligencePost[];
  total: number;
  nextOffset: number | null;
}

export type MediaSort = 'recent' | 'oldest' | 'interactions' | 'likes' | 'comments' | 'views';
export type MediaPeriod = 'all' | '30d' | '90d' | '365d';

export interface MediaQuery {
  accountId: string;
  q?: string;
  format?: ContentFormat | null;
  sort?: MediaSort;
  period?: MediaPeriod;
  performance?: 'above' | 'below' | null;
  offset?: number;
  limit?: number;
}

export type PostClassification = 'top' | 'attention' | 'typical' | 'insufficient';

export interface PostDetail {
  post: IntelligencePost;
  account: IntelligenceAccount;
  classification: PostClassification;
  comparison: {
    accountAvgInteractions: number | null;
    accountAvgEngagementRate: number | null;
    vsAccountPercent: number | null;
    formatAvgInteractions: number | null;
    formatPostCount: number;
    vsFormatPercent: number | null;
  };
  /** Measured facts about the post (format, time, caption length…). */
  observedFactors: { label: string; value: string }[];
  aiConfigured: boolean;
  definitions: MetricDefinitions;
}

export interface AiPostAnalysis {
  kind: 'top' | 'attention' | 'typical';
  summary: string;
  contributingFactors: string[];
  explanation: string;
  recommendation: string;
  suggestedHook: string | null;
  suggestedFormat: ContentFormat | null;
  nextTest: string;
  expectedMeasurement: string;
  generatedAt: string;
}

export interface AskAnswer {
  id: string;
  question: string;
  askedAt: string;
  /** false when the connected data cannot answer the question. */
  answerable: boolean;
  directAnswer: string;
  observation: string;
  supportingData: SupportingData;
  explanation: string;
  recommendation: string;
  expectedMeasurement: string;
}

export interface AskHistory {
  history: AskAnswer[];
  aiConfigured: boolean;
}

// ---- Planner (GET /api/planner/insights) --------------------------------

export interface TimingCell {
  dayOfWeek: DayOfWeek;
  /** 0–23, local to `PlannerInsights.timezone` */
  startHour: number;
  /** 1–24, exclusive */
  endHour: number;
  /** 0–100: average interactions relative to the best cell */
  score: number;
  postCount: number;
  avgInteractions: number;
}

export interface PublishingWindow {
  id: string;
  dayOfWeek: DayOfWeek;
  startHour: number;
  endHour: number;
  score: number;
  platform: SocialPlatform | null;
  rationale: string | null;
}

export interface PlannerInsights {
  /** IANA timezone, e.g. "Asia/Kolkata" */
  timezone: string;
  /** false until enough posts exist; heatmap and windows are then empty. */
  sufficient: boolean;
  postsAnalyzed: number;
  minimumRequired: number;
  heatmap: TimingCell[];
  recommendedWindows: PublishingWindow[];
}

// ---- Notifications (GET /api/notifications) -----------------------------

/** Named AppNotification to avoid clashing with the DOM `Notification` type. */
export interface AppNotification {
  id: string;
  kind: 'insight' | 'account' | 'system';
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationsResponse {
  notifications: AppNotification[];
}

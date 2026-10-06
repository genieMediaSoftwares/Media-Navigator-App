import type { HeatmapMetric, MetricHeatmap, PostAnalysisBlock, PostingRecommendation, SyncStatusSummary } from './analysis';

// Data contracts for Media Navigator API server responses (the `data` field of the envelope).
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

/** One account (Facebook Page, YouTube channel, LinkedIn organization) offered after authorization. */
export interface PendingAccountOption {
  platformAccountId: string;
  accountName: string | null;
  accountUsername: string;
  profilePictureUrl: string | null;
}

/** An authorization that covers several accounts and waits for the user's choice (expires after 15 minutes). */
export interface PendingSelection {
  id: string;
  platform: SocialPlatform;
  options: PendingAccountOption[];
  expiresAt: string;
}

/** Result of POST /api/accounts/connect: a connected account, a choice to make, or an OAuth URL to open. */
export interface ConnectResponse {
  account?: { id: string; platform: SocialPlatform; accountName: string | null; username: string; status: ConnectionStatus };
  selection?: PendingSelection;
  authorizationUrl?: string;
}

export interface SyncSummary {
  accountId: string;
  postsSynced: number;
  metricsSynced: number;
  lastSyncedAt: string;
  /** partial: what was fetched is saved, but the run stopped early (`message` says why). */
  status?: 'completed' | 'partial';
  mode?: 'full' | 'incremental';
  /** Posts stored for the first time in this run. */
  newPosts?: number;
  profileMediaCount?: number | null;
  message?: string | null;
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
  /** The account the value belongs to (present since multi-platform support). */
  platform?: SocialPlatform;
  accountId?: string;
}

export interface HomeOverview {
  accounts: ConnectedAccount[];
  heroSignal: HeroSignal | null;
  channels: ChannelSummary[];
  insights: QuickInsight[];
}

// ---- Intelligence (/api/intelligence/*) ----------------------------------
// Every number is computed by the server from synced Meta data. `null` means Instagram did not
// provide the value: render "Not available", never 0.

/** Content types in each platform's vocabulary (see the server's CONTENT_FORMATS). */
export type ContentFormat = 'REEL' | 'POST' | 'CAROUSEL' | 'VIDEO' | 'STORY' | 'TEXT' | 'IMAGE' | 'LINK' | 'LIVE' | 'ARTICLE' | 'DOCUMENT' | 'POLL';

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

/**
 * Performance tier relative to the account's typical (median) post. top: at least 2× typical;
 * low: at most half of typical and older than 3 days; new: low so far but still collecting
 * interactions; moderate: in between.
 */
export type ContentTier = 'top' | 'moderate' | 'low' | 'new';

export interface TierThresholds {
  sufficient: boolean;
  minimumRequired: number;
  typicalInteractions: number | null;
  topMin: number | null;
  lowMax: number | null;
  counts: Record<ContentTier, number>;
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
  /** Present on library and post detail responses. */
  tier?: ContentTier | null;
  /** Percent difference from the typical (median) post. */
  vsTypicalPercent?: number | null;
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
  tiers: TierThresholds;
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
    status: 'running' | 'completed' | 'partial' | 'failed';
    startedAt: string;
    completedAt: string | null;
    itemsFetched: number;
    errorMessage: string | null;
  } | null;
  aiConfigured: boolean;
  definitions: MetricDefinitions;
  sync?: SyncStatusSummary;
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

/** Rebuilt by the server from stored data; never written by the AI model. */
export interface SupportingData {
  posts: SupportingPost[];
  formats: FormatPerformance[];
}

export type InsightType = 'pattern' | 'growth' | 'timing' | 'format' | 'risk';

/** Produced by the server (which calls Gemini); never generated on the device. */
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

export type MediaSort = 'recent' | 'oldest' | 'interactions' | 'lowest' | 'likes' | 'comments' | 'views';
export type MediaPeriod = 'all' | '30d' | '90d' | '365d';

export interface MediaQuery {
  accountId: string;
  q?: string;
  format?: ContentFormat | null;
  sort?: MediaSort;
  period?: MediaPeriod;
  performance?: 'above' | 'below' | null;
  tier?: 'top' | 'moderate' | 'low' | null;
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
    typicalInteractions: number | null;
    vsTypicalPercent: number | null;
    vsFormatPercent: number | null;
  };
  /** Measured facts about the post (format, time, caption length…). */
  observedFactors: { label: string; value: string }[];
  aiConfigured: boolean;
  definitions: MetricDefinitions;
  /** Performance score, measured reasons and comparisons; null when the post has no metrics. */
  analysis?: PostAnalysisBlock | null;
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
  /** What to repeat (top), try next time (moderate) or try instead (low). */
  actions?: string[];
  /** What to stop repeating (low only). */
  stop?: string[];
  /** What the available data cannot confirm. */
  cannotConfirm?: string[];
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
  /** The account the timing was measured for, and the accounts that can be chosen instead. */
  account?: IntelligenceAccount;
  accounts?: IntelligenceAccount[];
  /** Measured comparison points: account mean and typical (median) interactions per post. */
  baseline?: { avgInteractions: number | null; typicalInteractions: number | null };
  /** Publishing/scheduling support, stated by the server. */
  scheduling?: { supported: boolean; reason: string };
  /** Best day / time with confidence and measured reasons. */
  recommendation?: PostingRecommendation;
  /** Day × time heat maps per metric. */
  heatmaps?: Partial<Record<HeatmapMetric, MetricHeatmap>>;
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
  unreadCount: number;
}

// ---- Profile & security (/api/profile, /api/auth) --------------------------

export interface UserPreferences {
  /** IANA zone used for timing when set; null = the device's zone. */
  timeZone: string | null;
  notifySyncResults: boolean;
  notifyAiInsights: boolean;
  notifyConnectionIssues: boolean;
}

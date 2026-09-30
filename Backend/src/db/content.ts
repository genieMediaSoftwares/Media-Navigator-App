import type { AnyBulkWriteOperation } from 'mongoose';

import {
	AccountInsight,
	AccountInsightDoc,
	AiCache,
	AiQuestion,
	ContentFormat,
	ContentItem,
	ContentItemDoc,
	ContentMetrics,
	Platform,
	SyncRun,
	SyncRunDoc,
} from '../models';
import { interactionsOf } from '../services/intelligence';

// Content (posts/media/videos), account-level insights and sync runs for every platform.

/**
 * Row shape the analytics code consumes. Field names are the ones the Instagram-only D1 schema used,
 * so the intelligence formulas did not change in the migration; `platform`, `format` and
 * `published_at` were added for other platforms.
 */
export interface ContentRow {
	id: string;
	connected_account_id: string;
	platform: Platform;
	provider_media_id: string;
	format: ContentFormat;
	media_type: string | null;
	media_product_type: string | null;
	title: string | null;
	caption: string | null;
	permalink: string | null;
	media_url: string | null;
	thumbnail_url: string | null;
	/** Raw platform timestamp. */
	timestamp: string | null;
	/** Normalized ISO timestamp (UTC). */
	published_at: string | null;
	like_count: number | null;
	comments_count: number | null;
	views: number | null;
	reach: number | null;
	saved: number | null;
	shares: number | null;
	total_interactions: number | null;
	extra_metrics: Record<string, number | null> | null;
	insights_synced_at: number | null;
	created_at: number;
	updated_at: number;
}

/** @deprecated Kept for readability in Instagram-specific code. */
export type InstagramMediaRow = ContentRow;

export function toContentRow(doc: ContentItemDoc): ContentRow {
	const metrics = doc.metrics ?? ({} as ContentMetrics);
	return {
		id: doc._id,
		connected_account_id: doc.connectedAccountId,
		platform: doc.platform,
		provider_media_id: doc.platformContentId,
		format: doc.format,
		media_type: doc.mediaType ?? null,
		media_product_type: doc.mediaProductType ?? null,
		title: doc.title ?? null,
		caption: doc.caption ?? null,
		permalink: doc.permalink ?? null,
		media_url: doc.mediaUrl ?? null,
		thumbnail_url: doc.thumbnailUrl ?? null,
		timestamp: doc.timestampRaw ?? null,
		published_at: doc.publishedAt ? doc.publishedAt.toISOString() : null,
		like_count: metrics.likes ?? null,
		comments_count: metrics.comments ?? null,
		views: metrics.views ?? null,
		reach: metrics.reach ?? null,
		saved: metrics.saves ?? null,
		shares: metrics.shares ?? null,
		total_interactions: metrics.totalInteractions ?? null,
		extra_metrics: doc.extraMetrics ?? null,
		insights_synced_at: doc.insightsSyncedAt ? doc.insightsSyncedAt.getTime() : null,
		created_at: doc.createdAt.getTime(),
		updated_at: doc.updatedAt.getTime(),
	};
}

export interface ContentInput {
	platformContentId: string;
	format: ContentFormat;
	mediaType?: string | null;
	mediaProductType?: string | null;
	title?: string | null;
	caption?: string | null;
	permalink?: string | null;
	mediaUrl?: string | null;
	thumbnailUrl?: string | null;
	timestampRaw?: string | null;
	publishedAt?: Date | null;
	/** Counters returned with the item itself (likes, comments…). Always overwritten, null included. */
	counts: Partial<Pick<ContentMetrics, 'likes' | 'comments' | 'views' | 'shares'>>;
	/**
	 * Insight metrics, present only when the platform's insights call answered for this item. A null
	 * value keeps the previously stored value instead of erasing it (a failed insights call is not a zero).
	 */
	insights?: Partial<ContentMetrics> | null;
	extraMetrics?: Record<string, number | null> | null;
}

const METRIC_KEYS: readonly (keyof ContentMetrics)[] = ['views', 'reach', 'likes', 'comments', 'saves', 'shares', 'totalInteractions'];

function upsertOperation(
	userId: string,
	connectedAccountId: string,
	platform: Platform,
	item: ContentInput,
	now: number,
): AnyBulkWriteOperation<ContentItemDoc> {
	const at = new Date(now);
	const $set: Record<string, unknown> = {
		userId,
		platform,
		format: item.format,
		mediaType: item.mediaType ?? null,
		mediaProductType: item.mediaProductType ?? null,
		title: item.title ?? null,
		caption: item.caption ?? null,
		permalink: item.permalink ?? null,
		mediaUrl: item.mediaUrl ?? null,
		thumbnailUrl: item.thumbnailUrl ?? null,
		timestampRaw: item.timestampRaw ?? null,
		publishedAt: item.publishedAt ?? null,
		updatedAt: at,
	};
	const $setOnInsert: Record<string, unknown> = { _id: crypto.randomUUID(), createdAt: at, extraMetrics: null, insightsSyncedAt: null };

	const counted = new Set<keyof ContentMetrics>();
	for (const [key, value] of Object.entries(item.counts) as [keyof ContentMetrics, number | null | undefined][]) {
		$set[`metrics.${key}`] = value ?? null;
		counted.add(key);
	}
	for (const key of METRIC_KEYS) {
		if (counted.has(key)) continue;
		const value = item.insights?.[key] ?? null;
		if (value !== null) $set[`metrics.${key}`] = value;
		else $setOnInsert[`metrics.${key}`] = null;
	}
	$set.interactions = interactionsOf(item.counts.likes ?? null, item.counts.comments ?? null);
	if (item.insights) {
		$set.insightsSyncedAt = at;
		delete $setOnInsert.insightsSyncedAt;
	}
	if (item.extraMetrics) {
		$set.extraMetrics = item.extraMetrics;
		delete $setOnInsert.extraMetrics;
	}

	return {
		updateOne: {
			filter: { connectedAccountId, platformContentId: item.platformContentId },
			update: { $set, $setOnInsert },
			upsert: true,
		},
	};
}

/** Idempotent upsert of one page of content, in a single round trip. */
export async function upsertContentItems(
	userId: string,
	connectedAccountId: string,
	platform: Platform,
	items: ContentInput[],
	now: number,
): Promise<void> {
	if (items.length === 0) return;
	await ContentItem.bulkWrite(
		items.map((item) => upsertOperation(userId, connectedAccountId, platform, item, now)),
		{ ordered: false },
	);
}

export interface AccountInsightRow {
	id: string;
	connected_account_id: string;
	metric_name: string;
	metric_value: number;
	period: string | null;
	metric_date: string | null;
	provider_source: string;
	created_at: number;
	updated_at: number;
}

export async function upsertAccountInsight(
	connectedAccountId: string,
	insight: { metricName: string; metricValue: number; period?: string | null; metricDate?: string | null; providerSource: string },
	now: number,
): Promise<void> {
	const at = new Date(now);
	await AccountInsight.updateOne(
		{
			connectedAccountId,
			metricName: insight.metricName,
			period: insight.period ?? 'lifetime',
			metricDate: insight.metricDate ?? 'latest',
		},
		{
			$set: { metricValue: insight.metricValue, providerSource: insight.providerSource, updatedAt: at },
			$setOnInsert: { _id: crypto.randomUUID(), createdAt: at },
		},
		{ upsert: true },
	);
}

export async function getAccountInsights(connectedAccountId: string): Promise<AccountInsightRow[]> {
	const docs = await AccountInsight.find({ connectedAccountId }).lean<AccountInsightDoc[]>();
	return docs.map((doc) => ({
		id: doc._id,
		connected_account_id: doc.connectedAccountId,
		metric_name: doc.metricName,
		metric_value: doc.metricValue,
		period: doc.period,
		metric_date: doc.metricDate,
		provider_source: doc.providerSource,
		created_at: doc.createdAt.getTime(),
		updated_at: doc.updatedAt.getTime(),
	}));
}

export interface SyncRunRow {
	id: string;
	connected_account_id: string;
	status: 'running' | 'completed' | 'failed';
	started_at: number;
	completed_at: number | null;
	items_fetched: number;
	error_code: string | null;
	error_message: string | null;
	created_at: number;
}

export async function createSyncRun(connectedAccountId: string, now: number): Promise<string> {
	const run = await SyncRun.create({
		connectedAccountId,
		status: 'running',
		startedAt: new Date(now),
		completedAt: null,
		itemsFetched: 0,
		errorCode: null,
		errorMessage: null,
		createdAt: new Date(now),
	});
	return run._id;
}

export async function updateSyncRun(
	syncRunId: string,
	status: 'completed' | 'failed',
	itemsFetched: number,
	now: number,
	error?: { code: string; message: string },
): Promise<void> {
	await SyncRun.updateOne(
		{ _id: syncRunId },
		{
			$set: {
				status,
				completedAt: new Date(now),
				itemsFetched,
				errorCode: error?.code ?? null,
				errorMessage: error?.message ?? null,
			},
		},
	);
}

export async function getLastSyncRun(connectedAccountId: string): Promise<SyncRunRow | null> {
	const doc = await SyncRun.findOne({ connectedAccountId }).sort({ startedAt: -1 }).lean<SyncRunDoc>();
	if (!doc) return null;
	return {
		id: doc._id,
		connected_account_id: doc.connectedAccountId,
		status: doc.status,
		started_at: doc.startedAt.getTime(),
		completed_at: doc.completedAt ? doc.completedAt.getTime() : null,
		items_fetched: doc.itemsFetched,
		error_code: doc.errorCode ?? null,
		error_message: doc.errorMessage ?? null,
		created_at: doc.createdAt.getTime(),
	};
}

const RECENT_SORT = { publishedAt: -1, createdAt: -1, _id: 1 } as const;

/** Most recent content for an account (Home and dashboard use the latest 50). */
export async function getContentByAccountId(connectedAccountId: string, limit = 50): Promise<ContentRow[]> {
	const docs = await ContentItem.find({ connectedAccountId }).sort(RECENT_SORT).limit(limit).lean<ContentItemDoc[]>();
	return docs.map(toContentRow);
}

/** Every synced item for an account (bounded; a sync stores at most a few hundred items). */
export async function getAllContentByAccountId(connectedAccountId: string): Promise<ContentRow[]> {
	return getContentByAccountId(connectedAccountId, 1000);
}

export async function findContentById(connectedAccountId: string, id: string): Promise<ContentRow | null> {
	const doc = await ContentItem.findOne({ _id: id, connectedAccountId }).lean<ContentItemDoc>();
	return doc ? toContentRow(doc) : null;
}

export type MediaSort = 'recent' | 'oldest' | 'interactions' | 'likes' | 'comments' | 'views';

// Descending sorts put null last in MongoDB, so a missing metric never ranks as a low value.
const SORTS: Record<MediaSort, Record<string, 1 | -1>> = {
	recent: { publishedAt: -1, createdAt: -1, _id: 1 },
	oldest: { publishedAt: 1, createdAt: 1, _id: 1 },
	interactions: { interactions: -1, publishedAt: -1, _id: 1 },
	likes: { 'metrics.likes': -1, publishedAt: -1, _id: 1 },
	comments: { 'metrics.comments': -1, publishedAt: -1, _id: 1 },
	views: { 'metrics.views': -1, publishedAt: -1, _id: 1 },
};

export interface MediaQuery {
	search: string | null;
	format: string | null;
	/** Inclusive lower bound on the publication time (UTC). */
	since: Date | null;
	performance: 'above' | 'below' | null;
	/** Required when `performance` is set: account average interactions per post. */
	baselineInteractions: number | null;
	sort: MediaSort;
	limit: number;
	offset: number;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Filtered, paginated content for the library. User input is only ever used as literal values. */
export async function queryContent(connectedAccountId: string, query: MediaQuery): Promise<{ rows: ContentRow[]; total: number }> {
	const filter: Record<string, unknown> = { connectedAccountId };
	if (query.search) filter.caption = { $regex: escapeRegex(query.search), $options: 'i' };
	if (query.format) filter.format = query.format;
	if (query.since) filter.publishedAt = { $gte: query.since };
	if (query.performance && query.baselineInteractions !== null) {
		filter.interactions = { $ne: null, [query.performance === 'above' ? '$gt' : '$lt']: query.baselineInteractions };
	}

	const [docs, total] = await Promise.all([
		ContentItem.find(filter).sort(SORTS[query.sort]).skip(query.offset).limit(query.limit).lean<ContentItemDoc[]>(),
		ContentItem.countDocuments(filter),
	]);
	return { rows: docs.map(toContentRow), total };
}

/** Removes everything stored for an account (the former D1 schema did this with ON DELETE CASCADE). */
export async function deleteAccountData(connectedAccountId: string): Promise<void> {
	await Promise.all([
		ContentItem.deleteMany({ connectedAccountId }),
		AccountInsight.deleteMany({ connectedAccountId }),
		SyncRun.deleteMany({ connectedAccountId }),
		AiCache.deleteMany({ connectedAccountId }),
		AiQuestion.deleteMany({ connectedAccountId }),
	]);
}

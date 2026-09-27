export interface InstagramMediaRow {
	id: string;
	connected_account_id: string;
	provider_media_id: string;
	media_type: string | null;
	media_product_type: string | null;
	caption: string | null;
	permalink: string | null;
	media_url: string | null;
	thumbnail_url: string | null;
	timestamp: string | null;
	like_count: number | null;
	comments_count: number | null;
	views: number | null;
	reach: number | null;
	saved: number | null;
	shares: number | null;
	total_interactions: number | null;
	insights_synced_at: number | null;
	created_at: number;
	updated_at: number;
}

const MEDIA_COLUMNS =
	'id, connected_account_id, provider_media_id, media_type, media_product_type, caption, permalink, media_url, thumbnail_url, timestamp, like_count, comments_count, views, reach, saved, shares, total_interactions, insights_synced_at, created_at, updated_at';

export interface InstagramInsightRow {
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

export interface InstagramSyncRunRow {
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

export interface InstagramMediaInput {
	providerMediaId: string;
	mediaType?: string | null;
	mediaProductType?: string | null;
	caption?: string | null;
	permalink?: string | null;
	mediaUrl?: string | null;
	thumbnailUrl?: string | null;
	timestamp?: string | null;
	likeCount?: number | null;
	commentsCount?: number | null;
	/** Present only when the media insights edge answered for this item. */
	insights?: {
		views: number | null;
		reach: number | null;
		saved: number | null;
		shares: number | null;
		totalInteractions: number | null;
	} | null;
}

/**
 * One idempotent upsert statement, so a page of media can be written with a single `db.batch()`.
 * When this sync did not receive insights for an item, previously stored insight values are kept
 * (COALESCE) instead of being overwritten with NULL.
 */
export function buildUpsertInstagramMediaStatement(
	db: D1Database,
	connectedAccountId: string,
	media: InstagramMediaInput,
	now: number,
): D1PreparedStatement {
	const insights = media.insights ?? null;
	return db
		.prepare(
			`INSERT INTO instagram_media
         (id, connected_account_id, provider_media_id, media_type, media_product_type, caption, permalink, media_url, thumbnail_url, timestamp, like_count, comments_count,
          views, reach, saved, shares, total_interactions, insights_synced_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (connected_account_id, provider_media_id) DO UPDATE SET
         media_type = excluded.media_type,
         media_product_type = excluded.media_product_type,
         caption = excluded.caption,
         permalink = excluded.permalink,
         media_url = excluded.media_url,
         thumbnail_url = excluded.thumbnail_url,
         timestamp = excluded.timestamp,
         like_count = excluded.like_count,
         comments_count = excluded.comments_count,
         views = COALESCE(excluded.views, instagram_media.views),
         reach = COALESCE(excluded.reach, instagram_media.reach),
         saved = COALESCE(excluded.saved, instagram_media.saved),
         shares = COALESCE(excluded.shares, instagram_media.shares),
         total_interactions = COALESCE(excluded.total_interactions, instagram_media.total_interactions),
         insights_synced_at = COALESCE(excluded.insights_synced_at, instagram_media.insights_synced_at),
         updated_at = excluded.updated_at`,
		)
		.bind(
			crypto.randomUUID(),
			connectedAccountId,
			media.providerMediaId,
			media.mediaType ?? null,
			media.mediaProductType ?? null,
			media.caption ?? null,
			media.permalink ?? null,
			media.mediaUrl ?? null,
			media.thumbnailUrl ?? null,
			media.timestamp ?? null,
			media.likeCount ?? null,
			media.commentsCount ?? null,
			insights?.views ?? null,
			insights?.reach ?? null,
			insights?.saved ?? null,
			insights?.shares ?? null,
			insights?.totalInteractions ?? null,
			insights ? now : null,
			now,
			now,
		);
}

export async function upsertInstagramMedia(
	db: D1Database,
	connectedAccountId: string,
	media: InstagramMediaInput,
	now: number,
): Promise<void> {
	await buildUpsertInstagramMediaStatement(db, connectedAccountId, media, now).run();
}

export async function upsertInstagramInsight(
	db: D1Database,
	connectedAccountId: string,
	insight: {
		metricName: string;
		metricValue: number;
		period?: string | null;
		metricDate?: string | null;
		providerSource: string;
	},
	now: number,
): Promise<void> {
	const period = insight.period ?? 'lifetime';
	const metricDate = insight.metricDate ?? 'latest';

	const existing = await db
		.prepare(
			`SELECT id FROM instagram_insights WHERE connected_account_id = ? AND metric_name = ? AND period = ? AND metric_date = ?`,
		)
		.bind(connectedAccountId, insight.metricName, period, metricDate)
		.first<{ id: string }>();

	if (existing) {
		await db
			.prepare(
				`UPDATE instagram_insights
         SET metric_value = ?, provider_source = ?, updated_at = ?
         WHERE id = ?`,
			)
			.bind(insight.metricValue, insight.providerSource, now, existing.id)
			.run();
	} else {
		const id = crypto.randomUUID();
		await db
			.prepare(
				`INSERT INTO instagram_insights
         (id, connected_account_id, metric_name, metric_value, period, metric_date, provider_source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(id, connectedAccountId, insight.metricName, insight.metricValue, period, metricDate, insight.providerSource, now, now)
			.run();
	}
}

export async function createSyncRun(db: D1Database, connectedAccountId: string, now: number): Promise<string> {
	const id = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO instagram_sync_runs (id, connected_account_id, status, started_at, completed_at, items_fetched, error_code, error_message, created_at)
       VALUES (?, ?, 'running', ?, NULL, 0, NULL, NULL, ?)`,
		)
		.bind(id, connectedAccountId, now, now)
		.run();
	return id;
}

export async function updateSyncRun(
	db: D1Database,
	syncRunId: string,
	status: 'completed' | 'failed',
	itemsFetched: number,
	now: number,
	error?: { code: string; message: string },
): Promise<void> {
	await db
		.prepare(
			`UPDATE instagram_sync_runs
       SET status = ?, completed_at = ?, items_fetched = ?, error_code = ?, error_message = ?
       WHERE id = ?`,
		)
		.bind(status, now, itemsFetched, error?.code ?? null, error?.message ?? null, syncRunId)
		.run();
}

export async function getInstagramMediaByAccountId(
	db: D1Database,
	connectedAccountId: string,
	limit = 50,
): Promise<InstagramMediaRow[]> {
	const statement = db
		.prepare(
			`SELECT ${MEDIA_COLUMNS}
       FROM instagram_media
       WHERE connected_account_id = ?
       ORDER BY timestamp DESC, created_at DESC
       LIMIT ?`,
		)
		.bind(connectedAccountId, limit);
	const res = await statement.all<InstagramMediaRow>();
	return res.results;
}

export async function getInstagramInsightsByAccountId(
	db: D1Database,
	connectedAccountId: string,
): Promise<InstagramInsightRow[]> {
	const statement = db
		.prepare(
			`SELECT id, connected_account_id, metric_name, metric_value, period, metric_date, provider_source, created_at, updated_at
       FROM instagram_insights
       WHERE connected_account_id = ?`,
		)
		.bind(connectedAccountId);
	const res = await statement.all<InstagramInsightRow>();
	return res.results;
}

export async function getLastSyncRunByAccountId(
	db: D1Database,
	connectedAccountId: string,
): Promise<InstagramSyncRunRow | null> {
	const statement = db
		.prepare(
			`SELECT id, connected_account_id, status, started_at, completed_at, items_fetched, error_code, error_message, created_at
       FROM instagram_sync_runs
       WHERE connected_account_id = ?
       ORDER BY started_at DESC
       LIMIT 1`,
		)
		.bind(connectedAccountId);
	return statement.first<InstagramSyncRunRow>();
}

/** Every synced media row for an account (bounded; sync stores at most a few hundred items). */
export async function getAllInstagramMediaByAccountId(db: D1Database, connectedAccountId: string): Promise<InstagramMediaRow[]> {
	return getInstagramMediaByAccountId(db, connectedAccountId, 1000);
}

export async function findInstagramMediaById(
	db: D1Database,
	connectedAccountId: string,
	id: string,
): Promise<InstagramMediaRow | null> {
	return db
		.prepare(`SELECT ${MEDIA_COLUMNS} FROM instagram_media WHERE connected_account_id = ? AND id = ?`)
		.bind(connectedAccountId, id)
		.first<InstagramMediaRow>();
}

/** SQL mirror of `classifyFormat()` in services/intelligence.ts. Keep the two in sync. */
export const MEDIA_FORMAT_SQL = `CASE
  WHEN media_product_type = 'REELS' THEN 'REEL'
  WHEN media_product_type = 'STORY' THEN 'STORY'
  WHEN media_type = 'CAROUSEL_ALBUM' THEN 'CAROUSEL'
  WHEN media_type = 'VIDEO' THEN 'VIDEO'
  ELSE 'POST' END`;

/** likes + comments, or NULL when Meta returned neither. */
const INTERACTIONS_SQL = `(CASE WHEN like_count IS NULL AND comments_count IS NULL THEN NULL
  ELSE COALESCE(like_count, 0) + COALESCE(comments_count, 0) END)`;

export type MediaSort = 'recent' | 'oldest' | 'interactions' | 'likes' | 'comments' | 'views';

const SORT_SQL: Record<MediaSort, string> = {
	recent: 'timestamp DESC, created_at DESC',
	oldest: 'timestamp ASC, created_at ASC',
	// NULL metrics sort last: a missing value is not a low value.
	interactions: `${INTERACTIONS_SQL} IS NULL, ${INTERACTIONS_SQL} DESC, timestamp DESC`,
	likes: 'like_count IS NULL, like_count DESC, timestamp DESC',
	comments: 'comments_count IS NULL, comments_count DESC, timestamp DESC',
	views: 'views IS NULL, views DESC, timestamp DESC',
};

export interface MediaQuery {
	search: string | null;
	format: string | null;
	/** Inclusive lower bound, compared against the stored ISO timestamp prefix (UTC). */
	since: string | null;
	performance: 'above' | 'below' | null;
	/** Required when `performance` is set: account average interactions per post. */
	baselineInteractions: number | null;
	sort: MediaSort;
	limit: number;
	offset: number;
}

/** Filtered, paginated media for the content library. All user input is bound, never interpolated. */
export async function queryInstagramMedia(
	db: D1Database,
	connectedAccountId: string,
	query: MediaQuery,
): Promise<{ rows: InstagramMediaRow[]; total: number }> {
	const where: string[] = ['connected_account_id = ?'];
	const binds: unknown[] = [connectedAccountId];

	if (query.search) {
		// '!' escapes LIKE wildcards so a search for "50%" matches literally.
		where.push(`caption LIKE ? ESCAPE '!'`);
		binds.push(`%${query.search.replace(/[!%_]/g, (c) => `!${c}`)}%`);
	}
	if (query.format) {
		where.push(`(${MEDIA_FORMAT_SQL}) = ?`);
		binds.push(query.format);
	}
	if (query.since) {
		where.push('timestamp >= ?');
		binds.push(query.since);
	}
	if (query.performance && query.baselineInteractions !== null) {
		where.push(`${INTERACTIONS_SQL} IS NOT NULL AND ${INTERACTIONS_SQL} ${query.performance === 'above' ? '>' : '<'} ?`);
		binds.push(query.baselineInteractions);
	}

	const whereSql = where.join(' AND ');
	const [page, count] = await db.batch([
		db
			.prepare(`SELECT ${MEDIA_COLUMNS} FROM instagram_media WHERE ${whereSql} ORDER BY ${SORT_SQL[query.sort]} LIMIT ? OFFSET ?`)
			.bind(...binds, query.limit, query.offset),
		db.prepare(`SELECT COUNT(*) AS total FROM instagram_media WHERE ${whereSql}`).bind(...binds),
	]);
	return {
		rows: page.results as InstagramMediaRow[],
		total: Number((count.results[0] as { total: number } | undefined)?.total ?? 0),
	};
}

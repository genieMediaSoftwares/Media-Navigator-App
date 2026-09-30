/**
 * One-way, idempotent migration of the local Cloudflare D1 database and KV namespace (wrangler dev
 * state in Backend/.wrangler) into MongoDB.
 *
 *   npm run migrate:d1                     # insert missing documents, skip existing ones
 *   npm run migrate:d1 -- --dry-run        # read and verify only, write nothing
 *   npm run migrate:d1 -- --update         # also overwrite existing documents with the D1 values
 *   npm run migrate:d1 -- --state <dir>    # a different .wrangler/state directory
 *
 * Safety:
 *   - The D1/KV state is copied to .migration-backups/<timestamp>/ (gitignored) and a JSON export is
 *     written there BEFORE anything else; the migration then reads only from that frozen copy.
 *     Nothing in .wrangler is modified or deleted.
 *   - Original UUIDs become MongoDB _ids, so re-running never duplicates users, accounts or media.
 *   - Without --update, documents that already exist in MongoDB are left untouched (they may hold
 *     newer data from the Node backend).
 *   - Output contains counts and ids only: never password hashes, tokens, ciphertext or keys.
 */
import 'dotenv/config';

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { AnyBulkWriteOperation, Model } from 'mongoose';

import { loadConfig, setConfig } from '../src/config/env';
import { connectMongo, disconnectMongo, mongoDatabaseName } from '../src/db/mongo';
import { toContentRow } from '../src/db/content';
import {
	AccountInsight,
	AiCache,
	AiQuestion,
	ConnectedAccount,
	ContentItem,
	ContentItemDoc,
	DEFAULT_PREFERENCES,
	PlatformCredential,
	Profile,
	Session,
	SyncRun,
	User,
} from '../src/models';
import { decryptJson } from '../src/services/credentials';
import { classifyFormat, computeBaseline, interactionsOf, normalizeTimestamp } from '../src/services/intelligence';

type Row = Record<string, any>;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const UPDATE = args.includes('--update');
const stateArg = args.indexOf('--state');
const STATE_DIR = resolve(stateArg >= 0 ? args[stateArg + 1] : join(__dirname, '..', '.wrangler', 'state'));
const NOW = Date.now();

function findSqlite(dir: string): string {
	if (!existsSync(dir)) throw new Error(`Not found: ${dir}`);
	const files = readdirSync(dir).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
	if (files.length !== 1) throw new Error(`Expected exactly one database file in ${dir}, found ${files.length}`);
	return join(dir, files[0]);
}

const date = (ms: number | null | undefined) => (typeof ms === 'number' ? new Date(ms) : null);

interface Tally {
	source: number;
	inserted: number;
	updated: number;
	skipped: number;
	errors: number;
	notes: string[];
}
const report: Record<string, Tally> = {};
const tally = (name: string, source: number): Tally => (report[name] = { source, inserted: 0, updated: 0, skipped: 0, errors: 0, notes: [] });

/** Inserts missing documents (and with --update, replaces existing ones), counting each outcome. */
async function upsertAll<T extends { _id: string }>(model: Model<any>, docs: T[], t: Tally): Promise<void> {
	if (docs.length === 0) return;
	const existing = new Set((await model.find({ _id: { $in: docs.map((d) => d._id) } }, { _id: 1 }).lean<{ _id: string }[]>()).map((d) => d._id));
	const ops: AnyBulkWriteOperation<any>[] = [];
	for (const doc of docs) {
		if (existing.has(doc._id)) {
			if (!UPDATE) {
				t.skipped++;
				continue;
			}
			const { _id, ...fields } = doc;
			ops.push({ updateOne: { filter: { _id }, update: { $set: fields } } });
			t.updated++;
		} else {
			ops.push({ insertOne: { document: doc } });
			t.inserted++;
		}
	}
	if (DRY_RUN || ops.length === 0) return;
	try {
		await model.bulkWrite(ops as any, { ordered: false });
	} catch (error: any) {
		const failed = error?.writeErrors?.length ?? ops.length;
		t.errors += failed;
		t.notes.push(`bulk write reported ${failed} error(s): ${String(error?.writeErrors?.[0]?.errmsg ?? error?.message ?? error).replace(/mongodb(\+srv)?:\/\/\S+/g, '[uri]').slice(0, 200)}`);
	}
}

async function main(): Promise<void> {
	const config = loadConfig();
	setConfig(config);

	// ---- 1. Backup and export ------------------------------------------------------------------
	const d1Source = findSqlite(join(STATE_DIR, 'v3', 'd1', 'miniflare-D1DatabaseObject'));
	const kvSource = findSqlite(join(STATE_DIR, 'v3', 'kv', 'miniflare-KVNamespaceObject'));
	const backupDir = join(__dirname, '..', '.migration-backups', new Date(NOW).toISOString().replace(/[:.]/g, '-'));
	mkdirSync(backupDir, { recursive: true });
	cpSync(STATE_DIR, join(backupDir, 'wrangler-state'), { recursive: true });
	const d1Path = d1Source.replace(STATE_DIR, join(backupDir, 'wrangler-state'));
	const kvPath = kvSource.replace(STATE_DIR, join(backupDir, 'wrangler-state'));
	const kvBlobDir = join(backupDir, 'wrangler-state', 'v3', 'kv', 'CACHE', 'blobs');

	const d1 = new DatabaseSync(d1Path, { readOnly: true });
	const all = (table: string): Row[] => d1.prepare(`SELECT * FROM "${table}"`).all() as Row[];
	const source = {
		users: all('users'),
		profiles: all('profiles'),
		sessions: all('sessions'),
		connected_accounts: all('connected_accounts'),
		instagram_media: all('instagram_media'),
		instagram_insights: all('instagram_insights'),
		instagram_sync_runs: all('instagram_sync_runs'),
	};
	const kv = new DatabaseSync(kvPath, { readOnly: true });
	const kvEntries = (kv.prepare('SELECT key, blob_id, expiration FROM _mf_entries').all() as Row[]).map((e) => ({
		key: String(e.key),
		expiration: e.expiration === null ? null : Number(e.expiration),
		value: readFileSync(join(kvBlobDir, String(e.blob_id)), 'utf8'),
	}));
	writeFileSync(join(backupDir, 'd1-export.json'), JSON.stringify(source, null, 2));
	writeFileSync(join(backupDir, 'kv-export.json'), JSON.stringify(kvEntries, null, 2));
	console.log(`Backup written to ${backupDir} (raw wrangler state + JSON export; contains secrets — keep private, never commit)`);
	console.log(`Source D1: ${Object.entries(source).map(([k, v]) => `${k}=${v.length}`).join(', ')}; KV entries=${kvEntries.length}`);

	await connectMongo(config.MONGODB_URI);
	console.log(`Target MongoDB database: ${mongoDatabaseName()}${DRY_RUN ? ' (dry run: no writes)' : ''}${UPDATE ? ' (--update: existing documents overwritten)' : ''}`);

	// ---- 2. Transform and write ------------------------------------------------------------------
	const accountOwner = new Map(source.connected_accounts.map((a) => [a.id as string, a.user_id as string]));

	await upsertAll(
		User,
		source.users.map((u) => ({
			_id: u.id,
			email: u.email,
			passwordHash: u.password_hash,
			preferences: { ...DEFAULT_PREFERENCES },
			createdAt: date(u.created_at),
			updatedAt: date(u.updated_at),
		})),
		tally('users', source.users.length),
	);

	await upsertAll(
		Profile,
		source.profiles.map((p) => ({ _id: p.id, userId: p.user_id, displayName: p.display_name, avatarKey: p.avatar_key ?? null, createdAt: date(p.created_at), updatedAt: date(p.updated_at) })),
		tally('profiles', source.profiles.length),
	);

	const liveSessions = source.sessions.filter((s) => s.revoked_at === null && s.expires_at > NOW);
	const sessionTally = tally('sessions', source.sessions.length);
	sessionTally.skipped += source.sessions.length - liveSessions.length;
	sessionTally.notes.push(`${source.sessions.length - liveSessions.length} revoked/expired session(s) intentionally not migrated`);
	await upsertAll(
		Session,
		liveSessions.map((s) => ({
			_id: s.id,
			userId: s.user_id,
			tokenHash: s.token_hash,
			expiresAt: date(s.expires_at),
			createdAt: date(s.created_at),
			lastUsedAt: date(s.last_used_at),
			revokedAt: null,
		})),
		sessionTally,
	);

	await upsertAll(
		ConnectedAccount,
		source.connected_accounts.map((a) => ({
			_id: a.id,
			userId: a.user_id,
			platform: a.platform,
			platformAccountId: a.platform_account_id,
			accountName: a.account_name ?? null,
			accountUsername: a.account_username,
			profilePictureUrl: a.profile_picture_url ?? null,
			status: a.status,
			tokenReference: a.token_reference,
			tokenExpiresAt: date(a.token_expires_at),
			lastSyncedAt: date(a.last_synced_at),
			createdAt: date(a.created_at),
			updatedAt: date(a.updated_at),
		})),
		tally('connected_accounts', source.connected_accounts.length),
	);

	// Credentials: the AES-GCM ciphertext moves as-is (same key derivation in Node); it is never decrypted here except to verify.
	const credentialEntries = kvEntries.filter((e) => e.key.startsWith('credentials:'));
	const referenced = new Set(source.connected_accounts.map((a) => a.token_reference as string));
	const credentialDocs = credentialEntries.flatMap((e) => {
		const [, userId, tokenReference] = e.key.split(':');
		if (!referenced.has(tokenReference)) return [];
		const payload = JSON.parse(e.value) as { iv: string; ciphertext: string };
		const account = source.connected_accounts.find((a) => a.token_reference === tokenReference);
		return [{ _id: tokenReference, userId, iv: payload.iv, ciphertext: payload.ciphertext, createdAt: date(account?.created_at) ?? new Date(NOW) }];
	});
	const credentialTally = tally('platform_credentials (KV)', credentialEntries.length);
	credentialTally.skipped += credentialEntries.length - credentialDocs.length;
	if (credentialEntries.length !== credentialDocs.length) credentialTally.notes.push(`${credentialEntries.length - credentialDocs.length} orphaned credential(s) not referenced by any account were not migrated`);
	await upsertAll(PlatformCredential, credentialDocs, credentialTally);

	const toContentDoc = (m: Row) => {
		const publishedIso = normalizeTimestamp(m.timestamp ?? null);
		return {
			_id: m.id as string,
			userId: accountOwner.get(m.connected_account_id) as string,
			connectedAccountId: m.connected_account_id,
			platform: 'instagram' as const,
			platformContentId: m.provider_media_id,
			format: classifyFormat(m.media_type ?? null, m.media_product_type ?? null),
			mediaType: m.media_type ?? null,
			mediaProductType: m.media_product_type ?? null,
			title: null,
			caption: m.caption ?? null,
			permalink: m.permalink ?? null,
			mediaUrl: m.media_url ?? null,
			thumbnailUrl: m.thumbnail_url ?? null,
			timestampRaw: m.timestamp ?? null,
			publishedAt: publishedIso ? new Date(publishedIso) : null,
			metrics: {
				views: m.views ?? null,
				reach: m.reach ?? null,
				likes: m.like_count ?? null,
				comments: m.comments_count ?? null,
				saves: m.saved ?? null,
				shares: m.shares ?? null,
				totalInteractions: m.total_interactions ?? null,
			},
			interactions: interactionsOf(m.like_count ?? null, m.comments_count ?? null),
			extraMetrics: null,
			insightsSyncedAt: date(m.insights_synced_at),
			createdAt: date(m.created_at),
			updatedAt: date(m.updated_at),
		};
	};
	await upsertAll(ContentItem, source.instagram_media.map(toContentDoc), tally('instagram_media → content_items', source.instagram_media.length));

	await upsertAll(
		AccountInsight,
		source.instagram_insights.map((i) => ({
			_id: i.id,
			connectedAccountId: i.connected_account_id,
			metricName: i.metric_name,
			metricValue: i.metric_value,
			period: i.period ?? 'lifetime',
			metricDate: i.metric_date ?? 'latest',
			providerSource: i.provider_source,
			createdAt: date(i.created_at),
			updatedAt: date(i.updated_at),
		})),
		tally('instagram_insights → account_insights', source.instagram_insights.length),
	);

	await upsertAll(
		SyncRun,
		source.instagram_sync_runs.map((r) => ({
			_id: r.id,
			connectedAccountId: r.connected_account_id,
			status: r.status,
			startedAt: date(r.started_at),
			completedAt: date(r.completed_at),
			itemsFetched: r.items_fetched ?? 0,
			errorCode: r.error_code ?? null,
			errorMessage: r.error_message ?? null,
			createdAt: date(r.created_at),
		})),
		tally('instagram_sync_runs → sync_runs', source.instagram_sync_runs.length),
	);

	// AI cache (real Gemini output, still valid) and ask history. OAuth states and rate counters are temporary.
	const aiEntries = kvEntries.filter((e) => /^ai:v1:(insights|post):/.test(e.key));
	const liveAi = aiEntries.filter((e) => e.expiration === null || e.expiration > NOW);
	const aiTally = tally('ai cache (KV)', aiEntries.length);
	aiTally.skipped += aiEntries.length - liveAi.length;
	await upsertAll(
		AiCache,
		liveAi.flatMap((e) => {
			const accountId = e.key.split(':')[3];
			const userId = accountOwner.get(accountId);
			if (!userId) return [];
			return [{ _id: e.key, userId, connectedAccountId: accountId, value: JSON.parse(e.value), createdAt: new Date(NOW), expiresAt: e.expiration ? new Date(e.expiration) : new Date(NOW + 7 * 86_400_000) }];
		}),
		aiTally,
	);
	const askEntries = kvEntries.filter((e) => e.key.startsWith('ai:v1:asks:') && (e.expiration === null || e.expiration > NOW));
	const answers = askEntries.flatMap((e) => {
		const [, , , userId, accountId] = e.key.split(':');
		return (JSON.parse(e.value) as Array<{ id: string; askedAt: string }>).map((answer) => ({ _id: answer.id, userId, connectedAccountId: accountId, answer, askedAt: new Date(answer.askedAt) }));
	});
	await upsertAll(AiQuestion, answers, tally('ai questions (KV)', answers.length));
	const temporary = kvEntries.filter((e) => e.key.startsWith('oauth_state:') || e.key.startsWith('ai:v1:rate:')).length;
	console.log(`KV: ${temporary} temporary entr${temporary === 1 ? 'y' : 'ies'} (OAuth states, rate counters) intentionally not migrated`);

	// ---- 3. Verify --------------------------------------------------------------------------------
	const problems: string[] = [];
	const verifyCount = async (label: string, model: Model<any>, ids: string[]) => {
		const found = await model.countDocuments({ _id: { $in: ids } });
		console.log(`  ${label.padEnd(22)} D1/KV = ${String(ids.length).padStart(4)}   MongoDB = ${String(found).padStart(4)}   ${found === ids.length ? 'OK' : 'MISMATCH'}`);
		if (found !== ids.length) problems.push(`${label}: expected ${ids.length}, found ${found}`);
	};
	console.log('\nVerification (documents with the migrated ids):');
	await verifyCount('users', User, source.users.map((u) => u.id));
	await verifyCount('profiles', Profile, source.profiles.map((p) => p.id));
	await verifyCount('sessions (active)', Session, liveSessions.map((s) => s.id));
	await verifyCount('connected accounts', ConnectedAccount, source.connected_accounts.map((a) => a.id));
	await verifyCount('credentials', PlatformCredential, credentialDocs.map((c) => c._id));
	await verifyCount('instagram media', ContentItem, source.instagram_media.map((m) => m.id));
	await verifyCount('account insights', AccountInsight, source.instagram_insights.map((i) => i.id));
	await verifyCount('sync runs', SyncRun, source.instagram_sync_runs.map((r) => r.id));

	if (!DRY_RUN) {
		// Field-level comparison of every media item (metrics, nulls, timestamps, format).
		const stored = new Map((await ContentItem.find({ _id: { $in: source.instagram_media.map((m) => m.id) } }).lean<ContentItemDoc[]>()).map((d) => [d._id, d]));
		let mismatched = 0;
		for (const m of source.instagram_media) {
			const doc = stored.get(m.id);
			const expected = toContentDoc(m);
			const same =
				doc &&
				JSON.stringify(doc.metrics) === JSON.stringify(expected.metrics) &&
				doc.interactions === expected.interactions &&
				doc.format === expected.format &&
				doc.caption === expected.caption &&
				doc.permalink === expected.permalink &&
				doc.timestampRaw === expected.timestampRaw &&
				(doc.publishedAt?.getTime() ?? null) === (expected.publishedAt?.getTime() ?? null);
			if (!same) mismatched++;
		}
		const nullViews = source.instagram_media.filter((m) => m.views === null).length;
		const nullViewsMongo = [...stored.values()].filter((d) => d.metrics.views === null).length;
		console.log(`  media field check       ${source.instagram_media.length - mismatched}/${source.instagram_media.length} identical; views null D1 = ${nullViews}, MongoDB = ${nullViewsMongo}`);
		if (mismatched > 0 && !UPDATE) console.log('    (differences are expected where MongoDB already holds newer synced values; re-run with --update to overwrite)');
		if (mismatched > 0 && UPDATE) problems.push(`${mismatched} media item(s) differ from D1`);

		// Analytics parity: the baseline computed from D1 rows equals the one computed from MongoDB.
		for (const account of source.connected_accounts) {
			const d1Rows = source.instagram_media.filter((m) => m.connected_account_id === account.id);
			const d1Baseline = computeBaseline(d1Rows.map((m) => toContentRow(toContentDoc(m) as unknown as ContentItemDoc)));
			const mongoRows = [...stored.values()].filter((d) => d.connectedAccountId === account.id).map(toContentRow);
			const mongoBaseline = computeBaseline(mongoRows);
			const match = JSON.stringify(d1Baseline) === JSON.stringify(mongoBaseline);
			console.log(`  analytics @${account.account_username}: D1 avg=${d1Baseline.avgInteractions} median=${d1Baseline.medianInteractions} n=${d1Baseline.sampleSize} | MongoDB avg=${mongoBaseline.avgInteractions} median=${mongoBaseline.medianInteractions} n=${mongoBaseline.sampleSize} ${match ? 'OK' : 'DIFFERENT'}`);
			if (!match && UPDATE) problems.push(`analytics baseline differs for account ${account.id}`);

			// The migrated credential must decrypt with this server's ENCRYPTION_KEY (value never printed).
			const credential = await PlatformCredential.findById(account.token_reference).lean();
			let decrypts = false;
			try {
				decrypts = credential ? typeof (await decryptJson<{ accessToken?: string }>(credential)).accessToken === 'string' : false;
			} catch {
				decrypts = false;
			}
			console.log(`  credential @${account.account_username}: ${decrypts ? 'decrypts with ENCRYPTION_KEY' : 'DOES NOT DECRYPT (wrong ENCRYPTION_KEY or missing) — reconnect required'}`);
			if (!decrypts) problems.push(`credential for account ${account.id} does not decrypt`);
		}
	}

	console.log('\nResult:');
	for (const [name, t] of Object.entries(report)) {
		console.log(`  ${name.padEnd(38)} source=${t.source} inserted=${t.inserted} updated=${t.updated} skipped=${t.skipped} errors=${t.errors}${t.notes.length ? `\n      ${t.notes.join('\n      ')}` : ''}`);
	}
	const errors = Object.values(report).reduce((sum, t) => sum + t.errors, 0);
	if (errors > 0 || problems.length > 0) {
		console.log(`\nMIGRATION INCOMPLETE: ${[...problems, errors ? `${errors} write error(s)` : ''].filter(Boolean).join('; ')}`);
		process.exitCode = 1;
	} else {
		console.log(DRY_RUN ? '\nDry run complete. Nothing was written.' : '\nMigration verified: counts and key records match.');
	}
	d1.close();
	kv.close();
	await disconnectMongo();
}

main().catch(async (error: unknown) => {
	console.error('Migration failed:', String(error instanceof Error ? error.message : error).replace(/mongodb(\+srv)?:\/\/\S+/g, '[uri]'));
	await disconnectMongo().catch(() => undefined);
	process.exit(1);
});

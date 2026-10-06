import { getConfig } from '../config/env';
import { findAccountsDueForSync } from '../db/accounts';
import { HttpError } from '../lib/http';
import { redactSecrets } from '../lib/redact';
import { syncConnectedAccount } from './connections';

// Background sync: every SYNC_SCHEDULER_TICK_MS, connected accounts whose last sync is older than
// AUTO_SYNC_INTERVAL_MS are synced one at a time (new posts and fresh metrics without a manual tap).
// Runs in the API process; a host that sleeps idle instances (e.g. Render free plan) pauses it too.

const ACCOUNTS_PER_TICK = 10;

let running = false;

/** One scheduler pass. Exported for tests; returns how many accounts were attempted. */
export async function runScheduledSyncs(now = Date.now()): Promise<number> {
	const interval = getConfig().AUTO_SYNC_INTERVAL_MS;
	if (interval <= 0 || running) return 0;
	running = true;
	try {
		const due = await findAccountsDueForSync(now - interval, ACCOUNTS_PER_TICK);
		for (const account of due) {
			try {
				await syncConnectedAccount(account.user_id, account.id, Date.now());
			} catch (error) {
				// Failures are recorded on the sync run and as a notification by syncConnectedAccount.
				if (!(error instanceof HttpError)) {
					console.error('Scheduled sync failed', { accountId: account.id, error: redactSecrets(error instanceof Error ? error.message : String(error)) });
				}
			}
		}
		return due.length;
	} finally {
		running = false;
	}
}

/** Starts the scheduler; returns a function that stops it. */
export function startSyncScheduler(): () => void {
	const config = getConfig();
	if (config.AUTO_SYNC_INTERVAL_MS <= 0) {
		console.log('Automatic sync disabled (AUTO_SYNC_INTERVAL_MS=0).');
		return () => undefined;
	}
	const tick = () => {
		runScheduledSyncs().catch((error: unknown) => {
			console.error('Sync scheduler pass failed', { error: redactSecrets(error instanceof Error ? error.message : String(error)) });
		});
	};
	// First pass shortly after start-up, then on every tick.
	const first = setTimeout(tick, 30_000);
	const timer = setInterval(tick, config.SYNC_SCHEDULER_TICK_MS);
	first.unref();
	timer.unref();
	console.log(`Automatic sync every ${Math.round(config.AUTO_SYNC_INTERVAL_MS / 60_000)} min (checked every ${Math.round(config.SYNC_SCHEDULER_TICK_MS / 60_000)} min).`);
	return () => {
		clearTimeout(first);
		clearInterval(timer);
	};
}

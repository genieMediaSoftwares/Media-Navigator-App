import { model, Schema } from 'mongoose';

import { newId } from './ids';

/** partial: the run stored what it fetched but stopped early (rate limit, page error, page ceiling). */
export type SyncRunStatus = 'running' | 'completed' | 'partial' | 'failed';
/** full: every page of the platform's content; incremental: new posts plus recent posts' metrics. */
export type SyncMode = 'full' | 'incremental';

export interface SyncRunDoc {
	_id: string;
	connectedAccountId: string;
	status: SyncRunStatus;
	startedAt: Date;
	completedAt: Date | null;
	itemsFetched: number;
	mode: SyncMode;
	pagesFetched: number;
	/** Items stored for the first time in this run. */
	newItems: number;
	/** True when pagination reached the platform's last page. */
	reachedEnd: boolean;
	/** Content count the platform's profile reported during this run. */
	profileMediaCount: number | null;
	errorCode: string | null;
	errorMessage: string | null;
	createdAt: Date;
}

const syncRunSchema = new Schema<SyncRunDoc>(
	{
		_id: { type: String, default: newId },
		connectedAccountId: { type: String, required: true, ref: 'ConnectedAccount' },
		status: { type: String, required: true, enum: ['running', 'completed', 'partial', 'failed'] },
		startedAt: { type: Date, required: true },
		completedAt: { type: Date, default: null },
		itemsFetched: { type: Number, default: 0 },
		mode: { type: String, enum: ['full', 'incremental'], default: 'full' },
		pagesFetched: { type: Number, default: 0 },
		newItems: { type: Number, default: 0 },
		reachedEnd: { type: Boolean, default: false },
		profileMediaCount: { type: Number, default: null },
		errorCode: { type: String, default: null },
		errorMessage: { type: String, default: null },
		createdAt: { type: Date, required: true },
	},
	{ collection: 'sync_runs', versionKey: false },
);

syncRunSchema.index({ connectedAccountId: 1, startedAt: -1 }, { name: 'sync_runs_account_started_idx' });

export const SyncRun = model<SyncRunDoc>('SyncRun', syncRunSchema);

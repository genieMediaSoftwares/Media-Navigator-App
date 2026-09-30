import { model, Schema } from 'mongoose';

import { newId } from './ids';

export type SyncRunStatus = 'running' | 'completed' | 'failed';

export interface SyncRunDoc {
	_id: string;
	connectedAccountId: string;
	status: SyncRunStatus;
	startedAt: Date;
	completedAt: Date | null;
	itemsFetched: number;
	errorCode: string | null;
	errorMessage: string | null;
	createdAt: Date;
}

const syncRunSchema = new Schema<SyncRunDoc>(
	{
		_id: { type: String, default: newId },
		connectedAccountId: { type: String, required: true, ref: 'ConnectedAccount' },
		status: { type: String, required: true, enum: ['running', 'completed', 'failed'] },
		startedAt: { type: Date, required: true },
		completedAt: { type: Date, default: null },
		itemsFetched: { type: Number, default: 0 },
		errorCode: { type: String, default: null },
		errorMessage: { type: String, default: null },
		createdAt: { type: Date, required: true },
	},
	{ collection: 'sync_runs', versionKey: false },
);

syncRunSchema.index({ connectedAccountId: 1, startedAt: -1 }, { name: 'sync_runs_account_started_idx' });

export const SyncRun = model<SyncRunDoc>('SyncRun', syncRunSchema);

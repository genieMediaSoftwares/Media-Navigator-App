import { model, Schema } from 'mongoose';

import { newId } from './ids';

export type NotificationKind = 'insight' | 'account' | 'system';

export type NotificationEvent =
	| 'sync_completed'
	| 'sync_failed'
	| 'connection_expired'
	| 'account_connected'
	| 'account_disconnected'
	| 'ai_insight_available'
	| 'performance_anomaly'
	| 'security';

/** A notification created by a real server event. Never generated as filler. */
export interface NotificationDoc {
	_id: string;
	userId: string;
	kind: NotificationKind;
	event: NotificationEvent;
	title: string;
	body: string;
	connectedAccountId: string | null;
	/** Collapses repeats of the same condition (e.g. one "connection expired" per account until it is resolved). */
	dedupeKey: string | null;
	createdAt: Date;
	readAt: Date | null;
}

const notificationSchema = new Schema<NotificationDoc>(
	{
		_id: { type: String, default: newId },
		userId: { type: String, required: true, ref: 'User' },
		kind: { type: String, required: true, enum: ['insight', 'account', 'system'] },
		event: { type: String, required: true },
		title: { type: String, required: true, maxlength: 120 },
		body: { type: String, required: true, maxlength: 500 },
		connectedAccountId: { type: String, default: null },
		dedupeKey: { type: String, default: null },
		createdAt: { type: Date, required: true },
		readAt: { type: Date, default: null },
	},
	{ collection: 'notifications', versionKey: false },
);

notificationSchema.index({ userId: 1, createdAt: -1 }, { name: 'notifications_user_created_idx' });
notificationSchema.index(
	{ userId: 1, dedupeKey: 1 },
	{ unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } }, name: 'notifications_user_dedupe_unique' },
);

export const Notification = model<NotificationDoc>('Notification', notificationSchema);

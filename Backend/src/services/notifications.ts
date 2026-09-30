import { getPreferences } from '../db/users';
import { Notification, NotificationDoc, NotificationEvent, NotificationKind, UserPreferences } from '../models';

// Notifications are only ever created by real server events (a sync finished or failed, a token
// expired, an account was connected/disconnected, AI insights were generated, a measured anomaly).
// A notification with a dedupeKey is "rolling": a repeat of the same condition replaces the earlier
// one and marks it unread again, so the list shows current state instead of piling up duplicates.

export interface NotifyInput {
	event: NotificationEvent;
	kind: NotificationKind;
	title: string;
	body: string;
	connectedAccountId?: string | null;
	dedupeKey?: string | null;
	/** Only create when no notification with this dedupeKey exists yet (one-off events). */
	onlyOnce?: boolean;
	now?: number;
}

const PREFERENCE_FOR_EVENT: Partial<Record<NotificationEvent, keyof UserPreferences>> = {
	sync_completed: 'notifySyncResults',
	sync_failed: 'notifySyncResults',
	ai_insight_available: 'notifyAiInsights',
	performance_anomaly: 'notifyAiInsights',
	connection_expired: 'notifyConnectionIssues',
};

/** Records a notification. Never throws: a notification failure must not fail the action that caused it. */
export async function notify(userId: string, input: NotifyInput): Promise<void> {
	try {
		const preference = PREFERENCE_FOR_EVENT[input.event];
		if (preference && (await getPreferences(userId))[preference] === false) return;

		const at = new Date(input.now ?? Date.now());
		const fields = {
			kind: input.kind,
			event: input.event,
			title: input.title.slice(0, 120),
			body: input.body.slice(0, 500),
			connectedAccountId: input.connectedAccountId ?? null,
		};
		if (!input.dedupeKey) {
			await Notification.create({ userId, ...fields, dedupeKey: null, createdAt: at, readAt: null });
			return;
		}
		await Notification.updateOne(
			{ userId, dedupeKey: input.dedupeKey },
			input.onlyOnce
				? { $setOnInsert: { _id: crypto.randomUUID(), ...fields, createdAt: at, readAt: null } }
				: { $set: { ...fields, createdAt: at, readAt: null }, $setOnInsert: { _id: crypto.randomUUID() } },
			{ upsert: true },
		);
	} catch (error) {
		console.error('Failed to record notification', { event: input.event, error: error instanceof Error ? error.message : String(error) });
	}
}

/** Removes rolling notifications for a condition that no longer applies (e.g. an expired connection was fixed). */
export async function clearNotification(userId: string, dedupeKey: string): Promise<void> {
	await Notification.deleteOne({ userId, dedupeKey }).catch(() => undefined);
}

export interface AppNotification {
	id: string;
	kind: NotificationKind;
	title: string;
	body: string;
	createdAt: string;
	readAt: string | null;
}

export function toAppNotification(doc: NotificationDoc): AppNotification {
	return {
		id: doc._id,
		kind: doc.kind,
		title: doc.title,
		body: doc.body,
		createdAt: doc.createdAt.toISOString(),
		readAt: doc.readAt ? doc.readAt.toISOString() : null,
	};
}

export async function listNotifications(userId: string, limit = 50): Promise<AppNotification[]> {
	const docs = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean<NotificationDoc[]>();
	return docs.map(toAppNotification);
}

export async function markNotificationsRead(userId: string, ids: string[] | null, now: number): Promise<number> {
	const result = await Notification.updateMany(
		{ userId, readAt: null, ...(ids && { _id: { $in: ids } }) },
		{ $set: { readAt: new Date(now) } },
	);
	return result.modifiedCount;
}

export async function countUnread(userId: string): Promise<number> {
	return Notification.countDocuments({ userId, readAt: null });
}

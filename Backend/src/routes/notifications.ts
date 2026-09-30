import { Router } from 'express';

import { HttpError, ok, readJsonObject } from '../lib/http';
import { authOf, requireAuth } from '../middleware/auth';
import { countUnread, listNotifications, markNotificationsRead } from '../services/notifications';

export function notificationsRouter(): Router {
	const router = Router();
	router.use(requireAuth);

	/** GET /api/notifications — the 50 most recent notifications, newest first. */
	router.get('/', async (req, res) => {
		const userId = authOf(req).user.id;
		const [notifications, unreadCount] = await Promise.all([listNotifications(userId), countUnread(userId)]);
		ok(res, { notifications, unreadCount });
	});

	/** POST /api/notifications/read { ids? } — marks the given notifications (or all) as read. */
	router.post('/read', async (req, res) => {
		const body = readJsonObject(req);
		let ids: string[] | null = null;
		if (body.ids !== undefined) {
			if (!Array.isArray(body.ids) || body.ids.length > 100 || !body.ids.every((id) => typeof id === 'string')) {
				throw new HttpError(400, 'VALIDATION_ERROR', 'ids must be a list of notification ids.');
			}
			ids = body.ids as string[];
		}
		ok(res, { updated: await markNotificationsRead(authOf(req).user.id, ids, req.now) });
	});

	return router;
}

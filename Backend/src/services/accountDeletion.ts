import { findAccountsByUserId } from '../db/accounts';
import { deleteAccountData } from '../db/content';
import { isR2Configured } from '../integrations/r2';
import {
	AiCache,
	AiQuestion,
	AiUsage,
	ConnectedAccount,
	Notification,
	OAuthState,
	PendingConnection,
	PlatformCredential,
	Profile,
	Session,
	StoredFile,
	User,
} from '../models';
import { deleteAllUserFiles } from './storage/avatars';

/** Permanently deletes a user and everything stored for them (MongoDB documents and R2 objects). */
export async function deleteUserAccount(userId: string): Promise<void> {
	for (const account of await findAccountsByUserId(userId)) await deleteAccountData(account.id);
	if (isR2Configured()) await deleteAllUserFiles(userId);
	else await StoredFile.deleteMany({ userId });
	const escapedId = userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	await Promise.all([
		ConnectedAccount.deleteMany({ userId }),
		PlatformCredential.deleteMany({ userId }),
		Notification.deleteMany({ userId }),
		AiCache.deleteMany({ userId }),
		AiQuestion.deleteMany({ userId }),
		AiUsage.deleteMany({ _id: { $regex: `^${escapedId}:` } }),
		OAuthState.deleteMany({ userId }),
		PendingConnection.deleteMany({ userId }),
		Session.deleteMany({ userId }),
		Profile.deleteMany({ userId }),
	]);
	await User.deleteOne({ _id: userId });
}

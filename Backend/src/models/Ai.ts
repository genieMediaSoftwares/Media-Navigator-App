import { model, Schema } from 'mongoose';

import { newId } from './ids';

/** Cached Gemini output, keyed by account + data version so a new sync invalidates it. */
export interface AiCacheDoc {
	_id: string;
	userId: string;
	connectedAccountId: string | null;
	value: unknown;
	createdAt: Date;
	expiresAt: Date;
}

const aiCacheSchema = new Schema<AiCacheDoc>(
	{
		_id: { type: String, required: true },
		userId: { type: String, required: true, ref: 'User' },
		connectedAccountId: { type: String, default: null },
		value: { type: Schema.Types.Mixed, required: true },
		createdAt: { type: Date, required: true },
		expiresAt: { type: Date, required: true },
	},
	{ collection: 'ai_cache', versionKey: false, minimize: false },
);
aiCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ai_cache_expires_ttl' });
aiCacheSchema.index({ userId: 1 }, { name: 'ai_cache_user_id_idx' });

export const AiCache = model<AiCacheDoc>('AiCache', aiCacheSchema);

/** One "Ask Media Navigator" question and the stored answer. */
export interface AiQuestionDoc {
	_id: string;
	userId: string;
	connectedAccountId: string;
	answer: unknown;
	askedAt: Date;
}

const aiQuestionSchema = new Schema<AiQuestionDoc>(
	{
		_id: { type: String, default: newId },
		userId: { type: String, required: true, ref: 'User' },
		connectedAccountId: { type: String, required: true },
		answer: { type: Schema.Types.Mixed, required: true },
		askedAt: { type: Date, required: true },
	},
	{ collection: 'ai_questions', versionKey: false, minimize: false },
);
aiQuestionSchema.index({ userId: 1, connectedAccountId: 1, askedAt: -1 }, { name: 'ai_questions_user_account_idx' });

export const AiQuestion = model<AiQuestionDoc>('AiQuestion', aiQuestionSchema);

/** Per-user hourly Gemini call counter (rate limit). */
export interface AiUsageDoc {
	/** `${userId}:${hourBucket}` */
	_id: string;
	count: number;
	expiresAt: Date;
}

const aiUsageSchema = new Schema<AiUsageDoc>(
	{
		_id: { type: String, required: true },
		count: { type: Number, required: true, default: 0 },
		expiresAt: { type: Date, required: true },
	},
	{ collection: 'ai_usage', versionKey: false },
);
aiUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ai_usage_expires_ttl' });

export const AiUsage = model<AiUsageDoc>('AiUsage', aiUsageSchema);

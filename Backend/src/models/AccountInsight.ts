import { model, Schema } from 'mongoose';

import { newId } from './ids';

/** Account-level metrics: profile counters (followers…) and platform insight values. */
export interface AccountInsightDoc {
	_id: string;
	connectedAccountId: string;
	metricName: string;
	metricValue: number;
	/** 'lifetime' for profile counters, or the platform period (e.g. 'day'). */
	period: string;
	/** 'latest' for profile counters, or the platform's end_time. */
	metricDate: string;
	/** 'profile' (account fields) or 'insights_api'. */
	providerSource: string;
	createdAt: Date;
	updatedAt: Date;
}

const accountInsightSchema = new Schema<AccountInsightDoc>(
	{
		_id: { type: String, default: newId },
		connectedAccountId: { type: String, required: true, ref: 'ConnectedAccount' },
		metricName: { type: String, required: true },
		metricValue: { type: Number, required: true },
		period: { type: String, required: true },
		metricDate: { type: String, required: true },
		providerSource: { type: String, required: true },
		createdAt: { type: Date, required: true },
		updatedAt: { type: Date, required: true },
	},
	{ collection: 'account_insights', versionKey: false },
);

accountInsightSchema.index(
	{ connectedAccountId: 1, metricName: 1, period: 1, metricDate: 1 },
	{ unique: true, name: 'account_insights_unique' },
);

export const AccountInsight = model<AccountInsightDoc>('AccountInsight', accountInsightSchema);

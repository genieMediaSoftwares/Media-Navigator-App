import mongoose from 'mongoose';

// One shared Mongoose connection for the process. The URI comes from MONGODB_URI and is never logged
// (it can contain credentials); only the host-less database name is reported.

mongoose.set('strictQuery', true);

export async function connectMongo(uri: string): Promise<typeof mongoose> {
	if (mongoose.connection.readyState === 1) return mongoose;
	await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000, autoIndex: true });
	// Build declared indexes (unique email, token hash, …) before serving requests.
	await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
	return mongoose;
}

export async function disconnectMongo(): Promise<void> {
	await mongoose.disconnect();
}

export function isMongoConnected(): boolean {
	return mongoose.connection.readyState === 1;
}

/** Round-trips to the server, so /health reflects reachability and not just a cached socket state. */
export async function pingMongo(): Promise<boolean> {
	if (!isMongoConnected() || !mongoose.connection.db) return false;
	try {
		await mongoose.connection.db.admin().ping();
		return true;
	} catch {
		return false;
	}
}

export function mongoDatabaseName(): string | null {
	return mongoose.connection.db?.databaseName ?? null;
}

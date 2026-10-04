import dns from 'node:dns';
import mongoose from 'mongoose';

// One shared Mongoose connection for the process. The URI comes from MONGODB_URI and is never logged
// (it can contain credentials); only the host-less database name is reported.

mongoose.set('strictQuery', true);

function configureDnsFallback(): void {
	try {
		const servers = dns.getServers();
		if (servers.length === 0 || servers.includes('127.0.0.1') || servers.includes('::1')) {
			dns.setServers(['8.8.8.8', '1.1.1.1', ...servers.filter((s) => s !== '127.0.0.1' && s !== '::1')]);
		}
	} catch {
		// Ignore if DNS settings cannot be modified in current runtime environment.
	}
}

export async function connectMongo(uri: string): Promise<typeof mongoose> {
	if (mongoose.connection.readyState === 1) return mongoose;
	if (uri.startsWith('mongodb+srv://')) {
		configureDnsFallback();
	}
	try {
		await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000, autoIndex: true });
	} catch (err: unknown) {
		const msg = String((err as { message?: string })?.message ?? err);
		if (uri.startsWith('mongodb+srv://') && msg.includes('querySrv')) {
			try {
				dns.setServers(['8.8.8.8', '1.1.1.1']);
				await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000, autoIndex: true });
			} catch {
				throw err;
			}
		} else {
			throw err;
		}
	}
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

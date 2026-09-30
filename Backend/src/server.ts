import 'dotenv/config';

import { createApp } from './app';
import { loadConfig, setConfig } from './config/env';
import { connectMongo, disconnectMongo, mongoDatabaseName } from './db/mongo';
import { redactSecrets } from './lib/redact';

async function main(): Promise<void> {
	const config = loadConfig();
	setConfig(config);

	await connectMongo(config.MONGODB_URI);
	console.log(`MongoDB connected (database: ${mongoDatabaseName()})`);

	// Render (and any container host) routes traffic to PORT on all interfaces.
	const server = createApp().listen(config.PORT, config.HOST, () => {
		console.log(`Media Navigator API listening on http://${config.HOST}:${config.PORT} (${config.NODE_ENV})`);
	});

	const shutdown = (signal: string) => {
		console.log(`${signal} received, shutting down`);
		server.close(() => {
			disconnectMongo().finally(() => process.exit(0));
		});
		setTimeout(() => process.exit(1), 10_000).unref();
	};
	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
	// Messages from loadConfig name settings, never their values; driver errors are redacted.
	console.error('Failed to start server:', redactSecrets(error instanceof Error ? error.message : String(error)));
	process.exit(1);
});

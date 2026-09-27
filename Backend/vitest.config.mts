import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
	// The real migrations are applied to the test runtime's local D1 before tests run (test/apply-migrations.ts).
	const migrations = await readD1Migrations(fileURLToPath(new URL("./migrations", import.meta.url)));

	return {
		plugins: [
			cloudflareTest({
				wrangler: { configPath: "./wrangler.jsonc" },
				miniflare: {
					bindings: {
						TEST_MIGRATIONS: migrations,
						CORS_ALLOWED_ORIGINS: "https://allowed.example",
					},
				},
			}),
		],
		test: {
			setupFiles: ["./test/apply-migrations.ts"],
		},
	};
});

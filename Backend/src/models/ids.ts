/** Primary keys are random UUIDv4 strings, the same format the former D1 database used. */
export function newId(): string {
	return crypto.randomUUID();
}

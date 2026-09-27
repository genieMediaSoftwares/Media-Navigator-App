import { FieldErrors, HttpError } from './http';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
const EMAIL_MAX_LENGTH = 254;
const DISPLAY_NAME_MAX_LENGTH = 80;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

/** Expects an already-normalized email. */
export function emailError(email: string): string | null {
	if (email.length === 0) return 'Email is required.';
	if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
	return null;
}

export function passwordError(password: string): string | null {
	if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
	if (password.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
	if (password.trim().length === 0) return 'Password cannot be only spaces.';
	return null;
}

/** Expects an already-trimmed display name. */
export function displayNameError(displayName: string): string | null {
	if (displayName.length === 0) return 'Name is required.';
	if (displayName.length > DISPLAY_NAME_MAX_LENGTH) return `Name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters.`;
	return null;
}

/** Returns the field as a string, treating missing or non-string values as empty. */
export function stringField(body: Record<string, unknown>, name: string): string {
	const value = body[name];
	return typeof value === 'string' ? value : '';
}

export function throwIfInvalid(fields: FieldErrors): void {
	if (Object.keys(fields).length > 0) {
		throw new HttpError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', fields);
	}
}

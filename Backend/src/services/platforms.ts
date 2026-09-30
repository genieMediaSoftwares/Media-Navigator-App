import { Platform, PLATFORMS } from '../models';

const NAMES: Record<Platform, string> = {
	instagram: 'Instagram',
	facebook: 'Facebook',
	youtube: 'YouTube',
	linkedin: 'LinkedIn',
};

export function platformName(platform: Platform): string {
	return NAMES[platform];
}

export function isPlatform(value: unknown): value is Platform {
	return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);
}

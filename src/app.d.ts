import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

declare global {
	namespace App {
		interface Platform {
			env: {
				DB: D1Database;
				IMAGES: R2Bucket;
				ACCESS_KEY?: string;
			};
		}
	}
}

export {};

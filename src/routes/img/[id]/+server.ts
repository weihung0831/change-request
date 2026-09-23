import { error } from '@sveltejs/kit';
import { getImage } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const image = await getImage(params.id);
	if (!image) error(404);
	return new Response(new Uint8Array(image.body), {
		headers: {
			'Content-Type': image.contentType,
			'Cache-Control': 'private, max-age=31536000, immutable'
		}
	});
};

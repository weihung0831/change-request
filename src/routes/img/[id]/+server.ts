import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	const object = await platform!.env.IMAGES.get(params.id!);
	if (!object) error(404);
	return new Response(object.body as unknown as ReadableStream, {
		headers: {
			'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
			'Cache-Control': 'private, max-age=31536000, immutable',
			ETag: object.httpEtag
		}
	});
};

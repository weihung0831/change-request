import { isHttpError, isRedirect, redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/private';

const log: Handle = async ({ event, resolve }) => {
	const start = Date.now();
	let status = 500;
	try {
		const response = await resolve(event);
		status = response.status;
		return response;
	} catch (err) {
		if (isRedirect(err) || isHttpError(err)) status = err.status;
		throw err;
	} finally {
		const { pathname, search } = event.url;
		if (!pathname.startsWith('/_app/')) {
			const ip = event.request.headers.get('cf-connecting-ip') ?? event.getClientAddress();
			console.log(
				`${new Date().toISOString()} ${ip} ${event.request.method} ${pathname}${search} ${status} ${Date.now() - start}ms`
			);
		}
	}
};

const auth: Handle = async ({ event, resolve }) => {
	const key = env.ACCESS_KEY;
	if (key && event.url.pathname !== '/login' && event.cookies.get('access') !== key) {
		redirect(303, '/login');
	}
	return resolve(event);
};

export const handle = sequence(log, auth);

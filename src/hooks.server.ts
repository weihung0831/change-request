import { redirect, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const handle: Handle = async ({ event, resolve }) => {
	const key = env.ACCESS_KEY;
	if (key && event.url.pathname !== '/login' && event.cookies.get('access') !== key) {
		redirect(303, '/login');
	}
	return resolve(event);
};

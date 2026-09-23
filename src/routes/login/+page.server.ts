import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const key = String(form.get('key') ?? '');
		if (!key || key !== env.ACCESS_KEY) return fail(401, { wrong: true });
		cookies.set('access', key, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
		redirect(303, '/');
	}
};

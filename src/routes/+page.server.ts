import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	addImages,
	createItem,
	deleteImage,
	deleteItem,
	listItems,
	returnItem,
	setDone,
	updateItem
} from '$lib/server/db';

export const load: PageServerLoad = async ({ platform }) => {
	return { items: await listItems(platform!.env.DB) };
};

function readFields(form: FormData) {
	return {
		code: String(form.get('code') ?? '').trim(),
		content: String(form.get('content') ?? '').trim(),
		location: String(form.get('location') ?? '').trim()
	};
}

function readFiles(form: FormData) {
	return form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
}

export const actions: Actions = {
	create: async ({ request, platform }) => {
		const form = await request.formData();
		const fields = readFields(form);
		if (!fields.code || !fields.content) return fail(400, { message: '編號和修改內容都要填' });
		const { DB, IMAGES } = platform!.env;
		const id = await createItem(DB, fields);
		await addImages(DB, IMAGES, id, readFiles(form));
		return { ok: true };
	},

	update: async ({ request, platform }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const fields = readFields(form);
		if (!id || !fields.code || !fields.content) return fail(400, { message: '編號和修改內容都要填' });
		const { DB, IMAGES } = platform!.env;
		await updateItem(DB, id, fields);
		await addImages(DB, IMAGES, id, readFiles(form));
		return { ok: true };
	},

	toggle: async ({ request, platform }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const done = form.get('done') === '1';
		const by = String(form.get('by') ?? '').trim();
		if (!id) return fail(400, { message: '找不到項目' });
		if (!by) return fail(400, { message: '請先填你的名字' });
		await setDone(platform!.env.DB, id, done, by);
		return { ok: true };
	},

	return: async ({ request, platform }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const by = String(form.get('by') ?? '').trim();
		const note = String(form.get('note') ?? '').trim();
		if (!id) return fail(400, { message: '找不到項目' });
		if (!by || !note) return fail(400, { message: '名字和退回原因都要填' });
		const { DB, IMAGES } = platform!.env;
		await returnItem(DB, IMAGES, id, by, note, readFiles(form));
		return { ok: true };
	},

	delete: async ({ request, platform }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { message: '找不到項目' });
		const { DB, IMAGES } = platform!.env;
		await deleteItem(DB, IMAGES, id);
		return { ok: true };
	},

	deleteImage: async ({ request, platform }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: '找不到圖片' });
		const { DB, IMAGES } = platform!.env;
		await deleteImage(DB, IMAGES, id);
		return { ok: true };
	}
};

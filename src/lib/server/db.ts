import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

export type ImageRow = {
	id: string;
	item_id: number;
	event_id: number | null;
	content_type: string;
	created_at: string;
};

export type EventType = 'done' | 'reopen' | 'return';

export type EventRow = {
	id: number;
	item_id: number;
	type: EventType;
	by: string;
	note: string;
	created_at: string;
};

export type ItemRow = {
	id: number;
	code: string;
	content: string;
	location: string;
	done: number;
	done_by: string | null;
	done_at: string | null;
	created_at: string;
	updated_at: string;
};

export type ItemEvent = EventRow & { images: ImageRow[] };
export type Item = ItemRow & { images: ImageRow[]; events: ItemEvent[] };

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
	const map = new Map<K, T[]>();
	for (const row of rows) {
		const k = key(row);
		const list = map.get(k) ?? [];
		list.push(row);
		map.set(k, list);
	}
	return map;
}

export async function listItems(db: D1Database): Promise<Item[]> {
	const [items, images, events] = await Promise.all([
		db.prepare('SELECT * FROM items ORDER BY done ASC, code ASC').all<ItemRow>(),
		db.prepare('SELECT * FROM images ORDER BY created_at ASC').all<ImageRow>(),
		db.prepare('SELECT * FROM item_events ORDER BY id ASC').all<EventRow>()
	]);
	const itemImages = groupBy(
		images.results.filter((i) => i.event_id === null),
		(i) => i.item_id
	);
	const eventImages = groupBy(
		images.results.filter((i) => i.event_id !== null),
		(i) => i.event_id
	);
	const itemEvents = groupBy(
		events.results.map((e) => ({ ...e, images: eventImages.get(e.id) ?? [] })),
		(e) => e.item_id
	);
	return items.results.map((item) => ({
		...item,
		images: itemImages.get(item.id) ?? [],
		events: itemEvents.get(item.id) ?? []
	}));
}

export async function createItem(
	db: D1Database,
	data: { code: string; content: string; location: string }
): Promise<number> {
	const row = await db
		.prepare('INSERT INTO items (code, content, location) VALUES (?, ?, ?) RETURNING id')
		.bind(data.code, data.content, data.location)
		.first<{ id: number }>();
	if (!row) throw new Error('insert failed');
	return row.id;
}

export async function updateItem(
	db: D1Database,
	id: number,
	data: { code: string; content: string; location: string }
) {
	await db
		.prepare(
			"UPDATE items SET code = ?, content = ?, location = ?, updated_at = datetime('now') WHERE id = ?"
		)
		.bind(data.code, data.content, data.location, id)
		.run();
}

export async function setDone(db: D1Database, id: number, done: boolean, by: string) {
	await db.batch([
		db
			.prepare(
				"UPDATE items SET done = ?, done_by = ?, done_at = CASE WHEN ? THEN datetime('now') ELSE NULL END, updated_at = datetime('now') WHERE id = ?"
			)
			.bind(done ? 1 : 0, done ? by : null, done ? 1 : 0, id),
		db
			.prepare('INSERT INTO item_events (item_id, type, by) VALUES (?, ?, ?)')
			.bind(id, done ? 'done' : 'reopen', by)
	]);
}

export async function returnItem(
	db: D1Database,
	bucket: R2Bucket,
	id: number,
	by: string,
	note: string,
	files: File[]
) {
	const event = await db
		.prepare("INSERT INTO item_events (item_id, type, by, note) VALUES (?, 'return', ?, ?) RETURNING id")
		.bind(id, by, note)
		.first<{ id: number }>();
	if (!event) throw new Error('insert failed');
	await db
		.prepare(
			"UPDATE items SET done = 0, done_by = NULL, done_at = NULL, updated_at = datetime('now') WHERE id = ?"
		)
		.bind(id)
		.run();
	await addImages(db, bucket, id, files, event.id);
}

export async function deleteItem(db: D1Database, bucket: R2Bucket, id: number) {
	const images = await db
		.prepare('SELECT id FROM images WHERE item_id = ?')
		.bind(id)
		.all<{ id: string }>();
	if (images.results.length) await bucket.delete(images.results.map((i) => i.id));
	await db.batch([
		db.prepare('DELETE FROM images WHERE item_id = ?').bind(id),
		db.prepare('DELETE FROM item_events WHERE item_id = ?').bind(id),
		db.prepare('DELETE FROM items WHERE id = ?').bind(id)
	]);
}

export async function addImages(
	db: D1Database,
	bucket: R2Bucket,
	itemId: number,
	files: File[],
	eventId: number | null = null
) {
	for (const file of files) {
		if (!file.size || !file.type.startsWith('image/')) continue;
		const id = crypto.randomUUID();
		await bucket.put(id, await file.arrayBuffer(), {
			httpMetadata: { contentType: file.type }
		});
		await db
			.prepare('INSERT INTO images (id, item_id, event_id, content_type) VALUES (?, ?, ?, ?)')
			.bind(id, itemId, eventId, file.type)
			.run();
	}
}

export async function deleteImage(db: D1Database, bucket: R2Bucket, id: string) {
	await bucket.delete(id);
	await db.prepare('DELETE FROM images WHERE id = ?').bind(id).run();
}

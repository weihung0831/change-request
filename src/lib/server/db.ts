import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import mysql, { type ExecuteValues, type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { env } from '$env/dynamic/private';

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

let ready: Promise<Pool> | undefined;

function db(): Promise<Pool> {
	ready ??= connect().catch((err) => {
		ready = undefined;
		throw err;
	});
	return ready;
}

async function connect(): Promise<Pool> {
	if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
	await migrate(env.DATABASE_URL);
	await mkdir(imageDir(), { recursive: true });
	return mysql.createPool({ uri: env.DATABASE_URL, dateStrings: true });
}

async function migrate(uri: string) {
	const conn = await mysql.createConnection({ uri, multipleStatements: true });
	try {
		await conn.query(
			'CREATE TABLE IF NOT EXISTS migrations (name VARCHAR(255) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()))'
		);
		const [rows] = await conn.query<RowDataPacket[]>('SELECT name FROM migrations');
		const applied = new Set(rows.map((r) => r.name as string));
		const dir = resolve('migrations');
		const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
		for (const name of files) {
			if (applied.has(name)) continue;
			await conn.query(await readFile(join(dir, name), 'utf8'));
			await conn.query('INSERT INTO migrations (name) VALUES (?)', [name]);
		}
	} finally {
		await conn.end();
	}
}

function imageDir() {
	return resolve(env.DATA_DIR || 'data', 'images');
}

async function select<T>(sql: string, params: ExecuteValues[] = []): Promise<T[]> {
	const [rows] = await (await db()).query<RowDataPacket[]>(sql, params);
	return rows as T[];
}

async function execute(sql: string, params: ExecuteValues[] = []): Promise<ResultSetHeader> {
	const [result] = await (await db()).execute<ResultSetHeader>(sql, params);
	return result;
}

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

export async function listItems(): Promise<Item[]> {
	const [items, images, events] = await Promise.all([
		select<ItemRow>('SELECT * FROM items ORDER BY done ASC, code ASC'),
		select<ImageRow>('SELECT * FROM images ORDER BY created_at ASC'),
		select<EventRow>('SELECT * FROM item_events ORDER BY id ASC')
	]);
	const itemImages = groupBy(
		images.filter((i) => i.event_id === null),
		(i) => i.item_id
	);
	const eventImages = groupBy(
		images.filter((i) => i.event_id !== null),
		(i) => i.event_id
	);
	const itemEvents = groupBy(
		events.map((e) => ({ ...e, images: eventImages.get(e.id) ?? [] })),
		(e) => e.item_id
	);
	return items.map((item) => ({
		...item,
		images: itemImages.get(item.id) ?? [],
		events: itemEvents.get(item.id) ?? []
	}));
}

export async function createItem(data: { code: string; content: string; location: string }): Promise<number> {
	const result = await execute('INSERT INTO items (code, content, location) VALUES (?, ?, ?)', [
		data.code,
		data.content,
		data.location
	]);
	return result.insertId;
}

export async function updateItem(id: number, data: { code: string; content: string; location: string }) {
	await execute(
		'UPDATE items SET code = ?, content = ?, location = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
		[data.code, data.content, data.location, id]
	);
}

export async function setDone(id: number, done: boolean, by: string) {
	const conn = await (await db()).getConnection();
	try {
		await conn.beginTransaction();
		await conn.execute(
			'UPDATE items SET done = ?, done_by = ?, done_at = IF(?, UTC_TIMESTAMP(), NULL), updated_at = UTC_TIMESTAMP() WHERE id = ?',
			[done ? 1 : 0, done ? by : null, done ? 1 : 0, id]
		);
		await conn.execute('INSERT INTO item_events (item_id, type, `by`) VALUES (?, ?, ?)', [
			id,
			done ? 'done' : 'reopen',
			by
		]);
		await conn.commit();
	} catch (err) {
		await conn.rollback();
		throw err;
	} finally {
		conn.release();
	}
}

export async function returnItem(id: number, by: string, note: string, files: File[]) {
	const event = await execute("INSERT INTO item_events (item_id, type, `by`, note) VALUES (?, 'return', ?, ?)", [
		id,
		by,
		note
	]);
	await execute(
		'UPDATE items SET done = 0, done_by = NULL, done_at = NULL, updated_at = UTC_TIMESTAMP() WHERE id = ?',
		[id]
	);
	await addImages(id, files, event.insertId);
}

export async function deleteItem(id: number) {
	const images = await select<{ id: string }>('SELECT id FROM images WHERE item_id = ?', [id]);
	await Promise.all(images.map((i) => rm(join(imageDir(), i.id), { force: true })));
	await execute('DELETE FROM items WHERE id = ?', [id]);
}

export async function addImages(itemId: number, files: File[], eventId: number | null = null) {
	for (const file of files) {
		if (!file.size || !file.type.startsWith('image/')) continue;
		const id = crypto.randomUUID();
		await writeFile(join(imageDir(), id), Buffer.from(await file.arrayBuffer()));
		await execute('INSERT INTO images (id, item_id, event_id, content_type) VALUES (?, ?, ?, ?)', [
			id,
			itemId,
			eventId,
			file.type
		]);
	}
}

export async function getImage(id: string): Promise<{ body: Buffer; contentType: string } | null> {
	const [row] = await select<{ content_type: string }>('SELECT content_type FROM images WHERE id = ?', [id]);
	if (!row) return null;
	const body = await readFile(join(imageDir(), id)).catch(() => null);
	return body && { body, contentType: row.content_type };
}

export async function deleteImage(id: string) {
	const [row] = await select<{ id: string }>('SELECT id FROM images WHERE id = ?', [id]);
	if (!row) return;
	await rm(join(imageDir(), row.id), { force: true });
	await execute('DELETE FROM images WHERE id = ?', [id]);
}

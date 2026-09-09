CREATE TABLE items (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	code TEXT NOT NULL,
	content TEXT NOT NULL,
	location TEXT NOT NULL DEFAULT '',
	done INTEGER NOT NULL DEFAULT 0,
	done_by TEXT,
	done_at TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE images (
	id TEXT PRIMARY KEY,
	item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
	content_type TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX images_item_id ON images(item_id);

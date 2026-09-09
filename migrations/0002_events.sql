CREATE TABLE item_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
	type TEXT NOT NULL,
	by TEXT NOT NULL,
	note TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX item_events_item_id ON item_events(item_id);

ALTER TABLE images ADD COLUMN event_id INTEGER REFERENCES item_events(id) ON DELETE CASCADE;

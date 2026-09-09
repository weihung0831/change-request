<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import type { Item, ItemEvent } from '$lib/server/db';

	let { data, form } = $props();

	type Filter = 'all' | 'open' | 'returned' | 'done';

	let name = $state('');
	let dialog: HTMLDialogElement;
	let returnDialog: HTMLDialogElement;
	let confirmDialog: HTMLDialogElement;
	let nameDialog: HTMLDialogElement;
	let editing = $state<Item | null>(null);
	let returning = $state<Item | null>(null);
	let deleting = $state<Item | null>(null);
	let fields = $state({ code: '', content: '', location: '' });
	let pending = $state<File[]>([]);
	let previews = $derived(pending.map((f) => URL.createObjectURL(f)));
	let viewing = $state<string | null>(null);
	let saving = $state(false);
	let error = $state('');
	let filter = $state<Filter>('all');
	let expanded = $state<number | null>(null);
	let q = $state('');
	let showDone = $state(false);
	let dragging = $state(false);
	let nameDraft = $state('');
	let pendingToggle: HTMLFormElement | null = null;

	function lastEvent(item: Item): ItemEvent | undefined {
		return item.events.at(-1);
	}

	function statusOf(item: Item): Exclude<Filter, 'all'> {
		if (item.done) return 'done';
		if (lastEvent(item)?.type === 'return') return 'returned';
		return 'open';
	}

	const statusLabel: Record<Exclude<Filter, 'all'>, string> = {
		open: '待處理',
		returned: '退回',
		done: '已完成'
	};

	const eventLabel: Record<ItemEvent['type'], string> = {
		done: '完成',
		reopen: '取消完成',
		return: '退回'
	};

	let counts = $derived({
		all: data.items.length,
		open: data.items.filter((i) => statusOf(i) === 'open').length,
		returned: data.items.filter((i) => statusOf(i) === 'returned').length,
		done: data.items.filter((i) => statusOf(i) === 'done').length
	});
	let percent = $derived(counts.all ? Math.round((counts.done / counts.all) * 100) : 0);
	function matches(item: Item) {
		const s = q.trim().toLowerCase();
		if (!s) return true;
		return [item.code, item.content, item.location].some((v) => v.toLowerCase().includes(s));
	}
	let visible = $derived(
		data.items.filter((i) => (filter === 'all' || statusOf(i) === filter) && matches(i))
	);
	let activeList = $derived(filter === 'all' ? visible.filter((i) => !i.done) : visible);
	let doneList = $derived(filter === 'all' ? visible.filter((i) => i.done) : []);

	onMount(() => {
		try {
			name = localStorage.getItem('cr-name') ?? '';
		} catch {}
	});

	$effect(() => {
		try {
			localStorage.setItem('cr-name', name);
		} catch {}
	});

	$effect(() => {
		if (form?.message) error = form.message;
	});

	function hue(s: string) {
		let h = 0;
		for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) % 360;
		return h;
	}

	function nextCode() {
		const codes = data.items.map((i) => i.code);
		const nums = codes.map((c) => Number(c.match(/\d+$/)?.[0] ?? 0)).filter(Boolean);
		const prefix = codes.at(-1)?.replace(/\d+$/, '') ?? 'A';
		const next = nums.length ? Math.max(...nums) + 1 : 1;
		return `${prefix}${String(next).padStart(2, '0')}`;
	}

	function openCreate() {
		editing = null;
		fields = { code: nextCode(), content: '', location: '' };
		pending = [];
		error = '';
		dialog.showModal();
	}

	function openEdit(item: Item) {
		editing = item;
		fields = { code: item.code, content: item.content, location: item.location };
		pending = [];
		error = '';
		dialog.showModal();
	}

	function openReturn(item: Item) {
		returning = item;
		pending = [];
		error = '';
		returnDialog.showModal();
	}

	function askDelete(item: Item) {
		deleting = item;
		confirmDialog.showModal();
	}

	function addFiles(list: FileList | File[] | null | undefined) {
		if (!list) return;
		const images = Array.from(list).filter((f) => f.type.startsWith('image/'));
		if (images.length) pending = [...pending, ...images];
	}

	function removePending(index: number) {
		pending = pending.filter((_, i) => i !== index);
	}

	function onPaste(e: ClipboardEvent) {
		if (!dialog.open && !returnDialog.open) return;
		addFiles(e.clipboardData?.files);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		addFiles(e.dataTransfer?.files);
	}

	function enhanceUpload(target: () => HTMLDialogElement) {
		return ({ formData }: { formData: FormData }) => {
			saving = true;
			error = '';
			formData.delete('images');
			for (const f of pending) formData.append('images', f);
			return async ({
				result,
				update
			}: {
				result: { type: string };
				update: (o?: { reset?: boolean }) => Promise<void>;
			}) => {
				saving = false;
				if (result.type === 'success') {
					target().close();
					pending = [];
				}
				await update({ reset: false });
			};
		};
	}

	function toggle(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		if (!name.trim()) {
			input.checked = !input.checked;
			pendingToggle = input.form;
			nameDraft = '';
			nameDialog.showModal();
			return;
		}
		input.form?.requestSubmit();
	}

	function submitName(e: SubmitEvent) {
		e.preventDefault();
		if (!nameDraft.trim()) return;
		name = nameDraft.trim();
		nameDialog.close();
		const form = pendingToggle;
		pendingToggle = null;
		queueMicrotask(() => form?.requestSubmit());
	}

	async function removeUploaded(id: string) {
		const body = new FormData();
		body.set('id', id);
		await fetch('?/deleteImage', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
		if (editing) editing.images = editing.images.filter((i) => i.id !== id);
	}

	function fmt(ts: string | null) {
		if (!ts) return '';
		return new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('zh-TW', {
			month: 'numeric',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});
	}

	function summary(item: Item) {
		const parts: string[] = [];
		if (item.location) parts.push(item.location);
		const imgs = item.images.length + item.events.reduce((n, e) => n + e.images.length, 0);
		if (imgs) parts.push(`${imgs} 張圖`);
		const ev = lastEvent(item);
		if (ev) parts.push(`${ev.by} ${eventLabel[ev.type]} ${fmt(ev.created_at)}`);
		return parts;
	}
</script>

<svelte:window onpaste={onPaste} />

<div class="glow"></div>

<main>
	<header>
		<div class="brand">
			<h1>系統修改清單</h1>
			<p>
				{#if counts.all === 0}
					還沒有項目
				{:else if counts.open + counts.returned === 0}
					全部完成，辛苦了
				{:else}
					還有 {counts.open + counts.returned} 項要處理
				{/if}
			</p>
		</div>
		<div class="tools">
			<label class="me">
				<span class="avatar" style:--h={hue(name || '?')}>{name.trim().slice(0, 1) || '?'}</span>
				<input class="who" bind:value={name} placeholder="你的名字" aria-label="你的名字" />
			</label>
			<button class="primary add" onclick={openCreate}><span aria-hidden="true">+</span>新增項目</button>
		</div>
	</header>

	{#if counts.all}
		<section class="stats" aria-label="狀態">
			{#each ['all', 'open', 'returned', 'done'] as const as key (key)}
				<button class="stat {key}" class:active={filter === key} onclick={() => (filter = key)}>
					<span class="label">{key === 'all' ? '全部' : statusLabel[key]}</span>
					<span class="num">{counts[key]}</span>
					{#if key === 'done'}
						<span class="ring" style:--p="{percent}%"></span>
					{/if}
				</button>
			{/each}
		</section>
	{/if}

	{#if counts.all}
		<div class="search">
			<input type="search" bind:value={q} placeholder="搜尋編號、內容或位置" aria-label="搜尋" />
			{#if q}
				<span class="hits">{visible.length} 筆</span>
			{/if}
		</div>
	{/if}

	{#if counts.all === 0}
		<div class="empty">
			<p>把要改的地方一條一條記下來，工程師改完自己打勾。</p>
			<button class="primary" onclick={openCreate}>新增第一個項目</button>
		</div>
	{:else if visible.length === 0}
		<div class="empty">
			<p>{q ? `找不到符合「${q.trim()}」的項目` : '這個分類沒有項目'}</p>
		</div>
	{:else}
		<ul class="list">
			{#each activeList as item (item.id)}
				{@render itemRow(item)}
			{/each}
			{#if doneList.length}
				<li class="section">
					<button class="section-toggle" class:on={showDone} onclick={() => (showDone = !showDone)}>
						<span class="chev" aria-hidden="true"></span>
						已完成 <span class="count">{doneList.length}</span>
					</button>
				</li>
				{#if showDone}
					{#each doneList as item (item.id)}
						{@render itemRow(item)}
					{/each}
				{/if}
			{/if}
		</ul>
	{/if}
</main>

{#snippet itemRow(item: Item)}
				{@const status = statusOf(item)}
				{@const ev = lastEvent(item)}
				{@const isOpen = expanded === item.id}
				<li class="item {status}" class:expanded={isOpen}>
					<div
						class="row"
						role="button"
						tabindex="0"
						aria-expanded={isOpen}
						onclick={() => (expanded = isOpen ? null : item.id)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								expanded = isOpen ? null : item.id;
							}
						}}
					>
						<form method="POST" action="?/toggle" use:enhance class="check">
							<input type="hidden" name="id" value={item.id} />
							<input type="hidden" name="done" value={item.done ? '0' : '1'} />
							<input type="hidden" name="by" value={name} />
							<input
								type="checkbox"
								checked={!!item.done}
								onchange={toggle}
								onclick={(e) => e.stopPropagation()}
								onkeydown={(e) => e.stopPropagation()}
								aria-label="標記完成"
							/>
						</form>
						<span class="code">{item.code}</span>
						<div class="main">
							<span class="content">{item.content}</span>
							<span class="sub">
								{#each summary(item) as part, i (i)}
									{#if i}<i></i>{/if}<span>{part}</span>
								{/each}
							</span>
						</div>
						<div class="row-actions" role="group" aria-label="操作">
							{#if item.done}
								<button
									class="ghost warn"
									onclick={(e) => {
										e.stopPropagation();
										openReturn(item);
									}}
									onkeydown={(e) => e.stopPropagation()}>退回</button
								>
							{/if}
							<button
								class="ghost"
								onclick={(e) => {
									e.stopPropagation();
									openEdit(item);
								}}
								onkeydown={(e) => e.stopPropagation()}>編輯</button
							>
							<button
								class="ghost danger"
								onclick={(e) => {
									e.stopPropagation();
									askDelete(item);
								}}
								onkeydown={(e) => e.stopPropagation()}>刪除</button
							>
						</div>
						<span class="pill {status}">{statusLabel[status]}</span>
						{#if ev}
							<span class="avatar sm" style:--h={hue(ev.by)} title={ev.by}>{ev.by.slice(0, 1)}</span>
						{:else}
							<span class="avatar sm none"></span>
						{/if}
						<span class="chev" aria-hidden="true"></span>
					</div>

					{#if isOpen}
						<div class="detail">
							<div class="col">
								{#if item.location}
									<h3>頁面位置或備註</h3>
									<p class="location">{item.location}</p>
								{/if}
								{#if item.images.length}
									<h3>截圖</h3>
									<div class="thumbs">
										{#each item.images as img (img.id)}
											<button class="thumb" onclick={() => (viewing = `/img/${img.id}`)}>
												<img src="/img/{img.id}" alt="截圖" loading="lazy" />
											</button>
										{/each}
									</div>
								{/if}
								{#if !item.location && !item.images.length}
									<p class="none-text">沒有補充說明</p>
								{/if}
							</div>
							<div class="col">
								<h3>歷程</h3>
								{#if item.events.length}
									<ol class="timeline">
										{#each [...item.events].reverse() as e (e.id)}
											<li class={e.type}>
												<span class="dot"></span>
												<div class="ev">
													<div class="ev-head">
														<span class="avatar xs" style:--h={hue(e.by)}>{e.by.slice(0, 1)}</span>
														<strong>{e.by}</strong>
														<span class="ev-type">{eventLabel[e.type]}</span>
														<time>{fmt(e.created_at)}</time>
													</div>
													{#if e.note}
														<p class="ev-note">{e.note}</p>
													{/if}
													{#if e.images.length}
														<div class="thumbs">
															{#each e.images as img (img.id)}
																<button class="thumb" onclick={() => (viewing = `/img/${img.id}`)}>
																	<img src="/img/{img.id}" alt="截圖" loading="lazy" />
																</button>
															{/each}
														</div>
													{/if}
												</div>
											</li>
										{/each}
									</ol>
								{:else}
									<p class="none-text">還沒有人動過</p>
								{/if}
							</div>
						</div>
					{/if}
				</li>
{/snippet}

<dialog
	bind:this={dialog}
	class:dragging
	ondrop={onDrop}
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
>
	<form
		method="POST"
		action={editing ? '?/update' : '?/create'}
		enctype="multipart/form-data"
		use:enhance={enhanceUpload(() => dialog)}
	>
		<h2>{editing ? '編輯項目' : '新增項目'}</h2>
		{#if editing}
			<input type="hidden" name="id" value={editing.id} />
		{/if}
		<div class="grid">
			<label class="short">
				<span>編號</span>
				<input name="code" bind:value={fields.code} required />
			</label>
			<label>
				<span>修改內容（一句話）</span>
				<input name="content" bind:value={fields.content} required />
			</label>
		</div>
		<label>
			<span>頁面位置或備註</span>
			<input name="location" bind:value={fields.location} placeholder="選填" />
		</label>
		<div class="field">
			<span>截圖或圖片</span>
			<label class="drop">
				<input
					type="file"
					accept="image/*"
					multiple
					onchange={(e) => {
						const input = e.currentTarget;
						addFiles(input.files);
						input.value = '';
					}}
				/>
				<strong>選擇圖片</strong>
				<span>或直接貼上（⌘ V）、拖進來</span>
			</label>
			{#if editing?.images.length || pending.length}
				<div class="thumbs">
					{#each editing?.images ?? [] as img (img.id)}
						<div class="thumb">
							<img src="/img/{img.id}" alt="已上傳" />
							<button type="button" class="remove" aria-label="刪除圖片" onclick={() => removeUploaded(img.id)}
								>×</button
							>
						</div>
					{/each}
					{#each previews as url, i (url)}
						<div class="thumb new">
							<img src={url} alt="待上傳" />
							<button type="button" class="remove" aria-label="移除" onclick={() => removePending(i)}>×</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
		{#if error}
			<p class="error">{error}</p>
		{/if}
		<div class="buttons">
			<button type="button" class="ghost" onclick={() => dialog.close()}>取消</button>
			<button type="submit" class="primary" disabled={saving}>{saving ? '儲存中' : '儲存'}</button>
		</div>
	</form>
</dialog>

<dialog
	bind:this={returnDialog}
	class:dragging
	ondrop={onDrop}
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
>
	<form
		method="POST"
		action="?/return"
		enctype="multipart/form-data"
		use:enhance={enhanceUpload(() => returnDialog)}
	>
		<h2>退回 {returning?.code}</h2>
		<p class="desc">{returning?.content}</p>
		<input type="hidden" name="id" value={returning?.id} />
		<div class="grid">
			<label class="short">
				<span>你的名字</span>
				<input name="by" bind:value={name} required />
			</label>
			<label>
				<span>還要改什麼</span>
				<textarea name="note" rows="3" required placeholder="例如：字還是太小，手機上看不清楚"></textarea>
			</label>
		</div>
		<div class="field">
			<span>截圖或圖片</span>
			<label class="drop">
				<input
					type="file"
					accept="image/*"
					multiple
					onchange={(e) => {
						const input = e.currentTarget;
						addFiles(input.files);
						input.value = '';
					}}
				/>
				<strong>選擇圖片</strong>
				<span>或直接貼上（⌘ V）、拖進來</span>
			</label>
			{#if pending.length}
				<div class="thumbs">
					{#each previews as url, i (url)}
						<div class="thumb new">
							<img src={url} alt="待上傳" />
							<button type="button" class="remove" aria-label="移除" onclick={() => removePending(i)}>×</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
		{#if error}
			<p class="error">{error}</p>
		{/if}
		<div class="buttons">
			<button type="button" class="ghost" onclick={() => returnDialog.close()}>取消</button>
			<button type="submit" class="destructive" disabled={saving}>{saving ? '送出中' : '退回'}</button>
		</div>
	</form>
</dialog>

<dialog bind:this={confirmDialog} class="small">
	<form
		method="POST"
		action="?/delete"
		use:enhance={() => {
			return async ({ update }) => {
				confirmDialog.close();
				deleting = null;
				await update();
			};
		}}
	>
		<h2>刪除 {deleting?.code}</h2>
		<p class="desc">「{deleting?.content}」和它的圖片、歷程會一起刪掉，不能復原。</p>
		<input type="hidden" name="id" value={deleting?.id} />
		<div class="buttons">
			<button type="button" class="ghost" onclick={() => confirmDialog.close()}>取消</button>
			<button type="submit" class="destructive">刪除</button>
		</div>
	</form>
</dialog>

<dialog bind:this={nameDialog} class="small">
	<form onsubmit={submitName}>
		<h2>你是誰？</h2>
		<p class="desc">打勾時會記錄是誰完成的，只要填一次。</p>
		<input bind:value={nameDraft} placeholder="你的名字" aria-label="你的名字" required />
		<div class="buttons">
			<button type="button" class="ghost" onclick={() => nameDialog.close()}>取消</button>
			<button type="submit" class="primary">完成並打勾</button>
		</div>
	</form>
</dialog>

{#if viewing}
	<button class="lightbox" onclick={() => (viewing = null)} aria-label="關閉">
		<img src={viewing} alt="放大檢視" />
	</button>
{/if}

<style>
	:global(:root) {
		--bg: #0c0e12;
		--panel: #14171c;
		--panel-2: #1b1f26;
		--panel-3: #232830;
		--line: rgba(255, 255, 255, 0.07);
		--line-strong: rgba(255, 255, 255, 0.14);
		--text: #eceef2;
		--muted: #8f96a3;
		--dim: #5b6270;
		--accent: #7aa2ff;
		--accent-strong: #3b7cff;
		--accent-ink: #0b1220;
		--ok: #45c98a;
		--warn: #f2a93b;
		--danger: #f26d6d;
		--radius: 12px;
		--ease: cubic-bezier(0.16, 1, 0.3, 1);
	}
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC',
			system-ui, sans-serif;
		font-size: 14px;
		line-height: 1.5;
		-webkit-font-smoothing: antialiased;
	}
	:global(*) {
		box-sizing: border-box;
	}
	.glow {
		position: fixed;
		inset: -40% 0 auto;
		height: 70vh;
		background: radial-gradient(60% 60% at 50% 0%, rgba(122, 162, 255, 0.14), transparent 70%);
		pointer-events: none;
	}
	main {
		position: relative;
		max-width: 960px;
		margin: 0 auto;
		padding: 56px 24px 140px;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 24px;
		flex-wrap: wrap;
		margin-bottom: 28px;
	}
	h1 {
		margin: 0;
		font-size: 26px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.brand p {
		margin: 4px 0 0;
		color: var(--muted);
	}
	.tools {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.me {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 40px;
		padding: 0 4px 0 6px;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 10px;
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}
	.me:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(122, 162, 255, 0.18);
	}
	.avatar {
		display: inline-grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		font-size: 12px;
		font-weight: 600;
		color: hsl(var(--h) 80% 90%);
		background: hsl(var(--h) 45% 32%);
		flex: none;
	}
	.avatar.sm {
		width: 24px;
		height: 24px;
		font-size: 11px;
	}
	.avatar.xs {
		width: 20px;
		height: 20px;
		font-size: 10px;
	}
	.avatar.none {
		background: transparent;
		border: 1px dashed var(--line-strong);
	}

	input:not([type='checkbox']):not([type='file']),
	textarea {
		height: 40px;
		padding: 0 12px;
		font: inherit;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}
	textarea {
		height: auto;
		padding: 9px 12px;
		resize: vertical;
	}
	input::placeholder,
	textarea::placeholder {
		color: var(--dim);
	}
	input:focus-visible,
	textarea:focus-visible {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(122, 162, 255, 0.18);
	}
	.me input.who {
		width: 104px;
		height: 100%;
		padding: 0 8px 0 0;
		background: transparent;
		border: 0;
		border-radius: 0;
		box-shadow: none;
	}

	button {
		height: 40px;
		padding: 0 16px;
		font: inherit;
		font-weight: 500;
		color: var(--text);
		background: var(--panel-2);
		border: 1px solid var(--line);
		border-radius: 10px;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s,
			transform 0.1s;
	}
	button:hover {
		border-color: var(--line-strong);
	}
	button:active {
		transform: translateY(1px);
	}
	button:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px rgba(122, 162, 255, 0.35);
	}
	button.primary {
		color: #fff;
		background: var(--accent-strong);
		border-color: transparent;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
	}
	button.primary:hover {
		background: #4f8bff;
	}
	button.add {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0 18px 0 14px;
	}
	button.add span {
		font-size: 18px;
		font-weight: 400;
		line-height: 1;
		margin-top: -2px;
	}
	button.primary:disabled {
		opacity: 0.6;
		cursor: default;
	}
	button.ghost {
		background: transparent;
		border-color: transparent;
		color: var(--muted);
		padding: 0 10px;
	}
	button.ghost:hover {
		background: var(--panel-2);
		color: var(--text);
	}
	button.ghost.danger:hover {
		color: var(--danger);
	}
	button.ghost.warn {
		color: var(--warn);
	}
	button.destructive {
		color: #fff;
		background: #c94848;
		border-color: transparent;
	}
	button.destructive:hover {
		background: #d95858;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 10px;
		margin-bottom: 20px;
	}
	.stat {
		position: relative;
		display: grid;
		gap: 6px;
		height: auto;
		padding: 14px 16px;
		text-align: left;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.stat::before {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: 3px;
		background: var(--c, transparent);
		opacity: 0;
		transition: opacity 0.15s;
	}
	.stat.open {
		--c: var(--accent);
	}
	.stat.returned {
		--c: var(--warn);
	}
	.stat.done {
		--c: var(--ok);
	}
	.stat.all {
		--c: var(--text);
	}
	.stat:hover::before,
	.stat.active::before {
		opacity: 1;
	}
	.stat.active {
		background: var(--panel-2);
		border-color: var(--line-strong);
	}
	.stat .label {
		font-size: 12px;
		color: var(--muted);
	}
	.stat .num {
		font-size: 26px;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.ring {
		position: absolute;
		right: 14px;
		top: 50%;
		width: 36px;
		height: 36px;
		margin-top: -18px;
		border-radius: 50%;
		background: conic-gradient(var(--ok) var(--p), var(--panel-3) 0);
		-webkit-mask: radial-gradient(circle, transparent 12px, #000 13px);
		mask: radial-gradient(circle, transparent 12px, #000 13px);
	}

	.search {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
	}
	.search input {
		flex: 1;
		max-width: 360px;
		background: var(--panel);
		border-color: var(--line);
	}
	.search input::-webkit-search-cancel-button {
		filter: invert(0.6);
	}
	.hits {
		font-size: 12px;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.section {
		margin-top: 10px;
	}
	.section-toggle {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		height: 34px;
		padding: 0 12px 0 10px;
		background: transparent;
		border-color: transparent;
		color: var(--muted);
		font-size: 13px;
	}
	.section-toggle:hover {
		background: var(--panel);
		color: var(--text);
	}
	.section-toggle .chev {
		transform: rotate(-45deg);
		margin: 0;
	}
	.section-toggle.on .chev {
		transform: rotate(45deg);
		margin-top: -3px;
	}
	.section-toggle .count {
		color: var(--dim);
		font-variant-numeric: tabular-nums;
	}
	.empty {
		padding: 80px 24px;
		text-align: center;
		color: var(--muted);
		border: 1px dashed var(--line-strong);
		border-radius: var(--radius);
	}
	.empty p {
		margin: 0 0 20px;
		font-size: 15px;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}
	.item {
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.item:hover {
		border-color: var(--line-strong);
	}
	.item.expanded {
		background: var(--panel-2);
		border-color: var(--line-strong);
	}
	.row {
		display: grid;
		grid-template-columns: auto auto 1fr auto auto auto auto;
		align-items: center;
		gap: 14px;
		padding: 12px 16px;
		cursor: pointer;
		border-radius: var(--radius);
	}
	.row:focus-visible {
		outline: none;
		box-shadow: inset 0 0 0 2px var(--accent);
	}
	.check {
		display: flex;
	}
	input[type='checkbox'] {
		appearance: none;
		width: 20px;
		height: 20px;
		margin: 0;
		border: 1.5px solid var(--line-strong);
		border-radius: 50%;
		background: transparent;
		cursor: pointer;
		display: grid;
		place-items: center;
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	input[type='checkbox']:hover {
		border-color: var(--ok);
	}
	input[type='checkbox']::after {
		content: '';
		width: 5px;
		height: 9px;
		margin-top: -2px;
		border: solid var(--accent-ink);
		border-width: 0 2px 2px 0;
		transform: rotate(45deg) scale(0);
		transition: transform 0.15s var(--ease);
	}
	input[type='checkbox']:checked {
		background: var(--ok);
		border-color: var(--ok);
	}
	input[type='checkbox']:checked::after {
		transform: rotate(45deg) scale(1);
	}
	input[type='checkbox']:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px rgba(69, 201, 138, 0.3);
	}
	.code {
		font-family: 'SF Mono', ui-monospace, Menlo, monospace;
		font-size: 12px;
		font-weight: 600;
		color: var(--muted);
		min-width: 40px;
	}
	.main {
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.content {
		font-size: 15px;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sub {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: var(--muted);
		overflow: hidden;
		white-space: nowrap;
	}
	.sub span {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub i {
		flex: none;
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: var(--dim);
	}
	.item.done .content {
		color: var(--muted);
		text-decoration: line-through;
		text-decoration-color: var(--dim);
	}
	.pill {
		font-size: 12px;
		font-weight: 500;
		padding: 3px 9px;
		border-radius: 999px;
		white-space: nowrap;
	}
	.pill.open {
		color: var(--accent);
		background: rgba(122, 162, 255, 0.12);
	}
	.pill.returned {
		color: var(--warn);
		background: rgba(242, 169, 59, 0.14);
	}
	.pill.done {
		color: var(--ok);
		background: rgba(69, 201, 138, 0.12);
	}
	.chev {
		width: 8px;
		height: 8px;
		border: solid var(--dim);
		border-width: 0 1.5px 1.5px 0;
		transform: rotate(45deg);
		margin: -4px 4px 0 0;
		transition: transform 0.2s var(--ease);
	}
	.item.expanded .chev {
		transform: rotate(-135deg);
		margin-top: 4px;
	}

	.detail {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 24px;
		padding: 4px 20px 20px 50px;
		animation: reveal 0.2s var(--ease);
	}
	@keyframes reveal {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	.detail h3 {
		margin: 12px 0 8px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.location {
		margin: 0;
		white-space: pre-wrap;
	}
	.none-text {
		margin: 12px 0 0;
		color: var(--dim);
	}
	.row-actions {
		display: flex;
		gap: 2px;
		margin-right: 6px;
	}
	.row-actions button {
		height: 30px;
		padding: 0 9px;
		font-size: 13px;
	}
	.row-actions button.warn {
		color: var(--warn);
	}

	.timeline {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}
	.timeline li {
		position: relative;
		display: grid;
		grid-template-columns: 12px 1fr;
		gap: 12px;
		padding-bottom: 14px;
	}
	.timeline li::before {
		content: '';
		position: absolute;
		left: 5px;
		top: 14px;
		bottom: -2px;
		width: 1px;
		background: var(--line-strong);
	}
	.timeline li:last-child::before {
		display: none;
	}
	.timeline .dot {
		width: 11px;
		height: 11px;
		margin-top: 5px;
		border-radius: 50%;
		background: var(--panel-3);
		border: 2px solid var(--panel-2);
		box-shadow: 0 0 0 1px var(--line-strong);
	}
	.timeline li.done .dot {
		background: var(--ok);
	}
	.timeline li.return .dot {
		background: var(--warn);
	}
	.ev {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.ev-head {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.ev-head strong {
		font-weight: 600;
	}
	.ev-type {
		color: var(--muted);
	}
	li.done .ev-type {
		color: var(--ok);
	}
	li.return .ev-type {
		color: var(--warn);
	}
	.ev-head time {
		margin-left: auto;
		font-size: 12px;
		color: var(--dim);
	}
	.ev-note {
		margin: 0;
		padding: 8px 12px;
		background: rgba(242, 169, 59, 0.08);
		border-left: 2px solid var(--warn);
		border-radius: 0 8px 8px 0;
		white-space: pre-wrap;
	}

	.thumbs {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.thumb {
		position: relative;
		width: 104px;
		height: 74px;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 8px;
		overflow: hidden;
		background: #000;
		transition:
			border-color 0.15s,
			transform 0.2s var(--ease);
	}
	.thumb:hover {
		border-color: var(--line-strong);
		transform: translateY(-1px);
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.thumb .remove {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 22px;
		height: 22px;
		padding: 0;
		line-height: 1;
		font-size: 14px;
		border-radius: 50%;
		border: 0;
		color: #fff;
		background: rgba(0, 0, 0, 0.65);
		opacity: 0;
		transition: opacity 0.15s;
	}
	.thumb:hover .remove {
		opacity: 1;
	}
	.thumb.new {
		border-color: var(--accent);
	}

	dialog {
		width: min(640px, 92vw);
		padding: 0;
		background: var(--panel);
		color: var(--text);
		border: 1px solid var(--line-strong);
		border-radius: 16px;
		box-shadow: 0 30px 90px rgba(0, 0, 0, 0.65);
	}
	dialog::backdrop {
		background: rgba(6, 7, 9, 0.7);
		backdrop-filter: blur(6px);
	}
	dialog[open] {
		animation: pop 0.22s var(--ease);
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.98);
		}
	}
	dialog form {
		display: grid;
		gap: 18px;
		padding: 28px;
	}
	dialog.small {
		width: min(400px, 92vw);
	}
	dialog.small form {
		gap: 14px;
		padding: 24px;
	}
	dialog.small input {
		width: 100%;
	}
	dialog h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	.desc {
		margin: -10px 0 0;
		color: var(--muted);
	}
	dialog label,
	dialog .field {
		display: grid;
		gap: 6px;
	}
	dialog label > span,
	dialog .field > span {
		font-size: 12px;
		color: var(--muted);
	}
	dialog label input,
	dialog label textarea {
		width: 100%;
	}
	.grid {
		display: grid;
		grid-template-columns: 120px 1fr;
		gap: 14px;
	}
	.drop {
		display: flex;
		gap: 8px;
		align-items: center;
		justify-content: center;
		padding: 22px;
		border: 1px dashed var(--line-strong);
		border-radius: 10px;
		color: var(--muted);
		cursor: pointer;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.drop:hover,
	dialog.dragging .drop {
		border-color: var(--accent);
		background: rgba(122, 162, 255, 0.06);
	}
	.drop strong {
		color: var(--accent);
		font-weight: 500;
	}
	.drop input {
		display: none;
	}
	.error {
		margin: 0;
		color: var(--danger);
	}
	.buttons {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 4px;
	}

	.lightbox {
		position: fixed;
		inset: 0;
		height: auto;
		padding: 32px;
		background: rgba(6, 7, 9, 0.9);
		border: 0;
		border-radius: 0;
		display: grid;
		place-items: center;
		z-index: 10;
		cursor: zoom-out;
	}
	.lightbox img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		border-radius: 8px;
	}

	@media (max-width: 720px) {
		main {
			padding: 28px 16px 100px;
		}
		.stats {
			grid-template-columns: repeat(2, 1fr);
		}
		.row {
			grid-template-columns: auto auto 1fr auto;
			row-gap: 6px;
		}
		.row-actions {
			grid-column: 2 / -1;
			margin: 0;
		}
		.pill,
		.avatar.sm,
		.chev {
			display: none;
		}
		.detail {
			grid-template-columns: 1fr;
			padding-left: 16px;
		}
		.grid {
			grid-template-columns: 1fr;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		*,
		dialog[open],
		.detail {
			transition: none !important;
			animation: none !important;
		}
	}
</style>

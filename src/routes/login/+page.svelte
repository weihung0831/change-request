<script lang="ts">
	let { form } = $props();
</script>

<main>
	<form method="POST">
		<h1>系統修改清單</h1>
		<p>輸入存取密碼進入</p>
		<input name="key" type="password" autocomplete="current-password" placeholder="存取密碼" aria-label="存取密碼" required />
		{#if form?.wrong}
			<span class="error">密碼不對</span>
		{/if}
		<button type="submit">進入</button>
	</form>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #0f1114;
		color: #e8eaee;
		font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang TC', 'Noto Sans TC',
			system-ui, sans-serif;
		font-size: 15px;
		-webkit-font-smoothing: antialiased;
	}
	main {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 24px;
	}
	form {
		display: grid;
		gap: 12px;
		width: min(340px, 100%);
		padding: 32px;
		background: #16191e;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 14px;
	}
	h1 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
	}
	p {
		margin: 0 0 8px;
		color: #8a9099;
	}
	input {
		height: 40px;
		padding: 0 12px;
		font: inherit;
		color: #e8eaee;
		background: #0f1114;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 10px;
	}
	input:focus-visible {
		outline: none;
		border-color: #6b9cff;
		box-shadow: 0 0 0 3px rgba(107, 156, 255, 0.18);
	}
	button {
		height: 40px;
		font: inherit;
		font-weight: 500;
		color: #0b1220;
		background: #6b9cff;
		border: 0;
		border-radius: 10px;
		cursor: pointer;
	}
	button:hover {
		background: #82acff;
	}
	.error {
		font-size: 13px;
		color: #f07178;
	}
</style>

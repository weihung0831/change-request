# 系統修改清單

給工程師看的「哪裡要改」清單。每個項目有編號、一句話說明、頁面位置、截圖，工程師改完自己打勾。

## 技術

- SvelteKit + TypeScript
- Cloudflare Workers（@sveltejs/adapter-cloudflare）
- D1 存項目資料，R2 存圖片

## 本地開發

```bash
npm install
npm run db:migrate
npm run dev
```

## 部署

正式站：https://change-request.weihung.xyz（自訂網域設定在 wrangler.jsonc 的 routes）。

第一次要先在 Cloudflare 後台啟用 R2，再建 bucket：

```bash
npx wrangler r2 bucket create change-request-images
npm run db:migrate:remote
npm run deploy
```

設定存取密碼（沒設就不用密碼）：

```bash
npx wrangler secret put ACCESS_KEY
```

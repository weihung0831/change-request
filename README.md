# 系統修改清單

這是一個記下「系統哪裡要改」的網頁。
網址：https://change-request.weihung.xyz

它就像大家共用的一面便條牆。
發現哪裡要改，就貼一張上去。
工程師改好了，自己在那張上面打勾。

**怎麼用**

1. 打開網址，輸入存取密碼。
2. 右上角填你的名字，只要填一次。
3. 按「新增項目」，填編號和一句話說明。
4. 「頁面位置或備註」可以不填。
5. 截圖可以選檔、直接貼上或拖進來。
6. 工程師改完就打勾，系統會記下是誰改的。
7. 檢查後還不對，按「退回」寫原因。
8. 退回的項目會回到待辦，等人再改。

點開一個項目，會看到它的「歷程」。
歷程記著誰、在什麼時候、做了什麼。
上方的搜尋框能找編號、內容或位置。

刪除會連截圖和歷程一起刪掉。
刪了就救不回來，按之前想清楚。

**資料放在哪裡**

網站放在 Cloudflare 上，是一家提供雲端主機的公司。
文字資料存在 D1，像雲端的記事本。
截圖存在 R2，像雲端的相簿。
程式用 SvelteKit 和 TypeScript 寫的。

**給工程師：在自己電腦上跑**

```bash
npm install
npm run db:migrate
npm run dev
```

本機沒設存取密碼，打開就能用。
改完程式可以跑 `npm run check` 檢查型別。

**給工程師：資料表要改欄位時**

在 `migrations/` 新增一個 SQL 檔，編號接著往下排。
本機跑 `npm run db:migrate`。
正式站跑 `npm run db:migrate:remote`。

**給工程師：上線**

第一次上線，要先到 Cloudflare 後台啟用 R2。
接著照順序跑這三行：

```bash
npx wrangler r2 bucket create change-request-images
npm run db:migrate:remote
npm run deploy
```

之後每次上線，只要跑 `npm run deploy`。
網域設定在 `wrangler.jsonc` 的 `routes`。

存取密碼用下面這行設定。
沒設的話，任何人打開網址都能用。

```bash
npx wrangler secret put ACCESS_KEY
```

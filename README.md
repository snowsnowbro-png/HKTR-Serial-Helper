# HKTR 序號助手

一個 Chrome Manifest V3 擴充功能，協助玩家在香港《跑Online》官方序號兌換頁填寫帳號、密碼及序號，並可加密儲存及切換多個玩家帳號。

- Chrome Web Store：https://chromewebstore.google.com/detail/jjnkkemlnofhbghdmbjjpfddabffilbk
- 使用頁面：https://hktr.uk/trredeem
- 私隱政策：https://hktr.uk/trredeem/privacy

## 版本狀態

- Chrome Web Store 已發佈版本：`v2.2.0`
- 目前 repository 開發版本：`v2.3.0`

`v2.2.0` tag 應與商店已發佈版本對應。`main` 分支可能包含仍在測試或等待商店審核的改動；請勿將未發佈的 development build 誤認為 Chrome Web Store 現行版本。

> 注意：本擴充功能不會讀取、辨識、繞過或提交驗證碼。你必須自行輸入驗證碼，並親自按提交按鈕。

> 安全提示：本專案是非官方第三方工具，會在使用者要求時處理遊戲帳號及密碼。請先閱讀原始碼、權限及私隱政策，再自行決定是否使用。Chrome Web Store 審核不代表零風險保證。

## 官方表格 selector

`content.js` 已按官方表格提供的 HTML 設定帳號、密碼及序號欄位 selector。每個欄位以 `name` 配合 `type` 作主要 selector，並以 `placeholder` 作後備。程式沒有設定 CAPTCHA 或提交按鈕的 selector。

## 在 Chrome 安裝（初學者步驟）

1. 確保所有專案檔案放在同一個資料夾內。
2. 在 Chrome 網址列輸入 `chrome://extensions`，然後按 Enter。
3. 開啟頁面右上角的「開發人員模式」。
4. 按「載入未封裝項目」。
5. 選擇包含 `manifest.json` 的 `HKTR-Serial-Helper` 資料夾。
6. 按 Chrome 工具列的拼圖圖示，找到「HKTR 序號助手」，需要的話可按圖釘固定。
7. 首次開啟助手時，閱讀本機資料用途披露，按一次「同意並開始使用」。毋須設定主密碼。
8. 舊版明文帳號會自動加密遷移；如曾使用 2.0 主密碼庫，只需最後輸入一次舊主密碼完成轉換。
9. 選擇「新增帳號」，只需填寫玩家帳號及密碼，再按「儲存／更新帳號」。
10. 要加入其他帳號，可再按「新增帳號」；要切換帳號，可從「目前使用帳號」清單選擇。
11. 到 `hktr.uk` 選擇序號；網站會把序號安全傳給助手，再開啟官方兌換頁。
12. 官方頁面會自動填寫目前選用帳號、密碼及網站傳入的序號。
13. 官方頁面的帳號欄上方亦會顯示「HKTR 序號助手」帳號選單。切換帳號只會更新帳號及密碼，已填序號不會消失。
14. 自行輸入官方頁面的驗證碼，檢查資料，然後親自提交。

修改程式後，請返回 `chrome://extensions`，在本擴充功能卡片按重新載入圖示，再重新整理官方頁面。

## 私隱與安全

- 玩家帳號、密碼及序號使用 AES-256-GCM 加密後，才寫入 `chrome.storage.local`。
- 首次同意時會自動建立目前 Chrome 使用者設定檔專用、不可匯出的隨機金鑰，並保存於 extension 的 IndexedDB；使用者毋須管理主密碼或每次解鎖。
- 由舊版本升級時，原有明文資料會自動加密；2.0 密碼庫使用者只需輸入一次舊主密碼完成重新加密，舊設定隨即移除。
- 如 Chrome 設定檔或裝置金鑰被清除，舊有加密資料無法復原，只能清除資料重新設定。
- 擴充功能只要求 `storage` 權限，內容程式亦只會在指定的 HTTPS 官方兌換網址執行。
- 擴充功能不會把密碼寫入 console，也不會把資料傳送到其他網站。
- 官方頁面的內容程式不能直接讀取本機加密資料；解密由背景程式處理，並只回傳目前選用帳號予指定官方頁面填表。
- 官方頁面的帳號選單只顯示帳號名稱；切換時不會改動序號欄。
- Popup 不要求玩家再次輸入序號；序號只由白名單網站傳入，或保留先前已加密的值。
- 使用者手動提交後，助手會在本機加密記錄該帳號及序號的兌換狀態。再次開啟相同組合時會顯示防重提醒。
- 只有官方結果頁明確顯示兌換成功或序號已使用，先會標示為已兌換；錯誤或失敗結果不會被誤記為成功。
- 官方頁面只可讀取公開顯示所需的 `popup-logo.png`；其他 extension 檔案及儲存資料不會公開。
- 擴充功能不處理驗證碼、不按提交按鈕，亦不使用 `<all_urls>`。
- 不再使用時，可按「清除已儲存資料」，再到 `chrome://extensions` 移除擴充功能。

## 專案檔案

- `manifest.json`：擴充功能設定及最小權限
- `icons/`：Chrome 工具列、擴充功能頁面及 popup 使用的圖示
- `popup.html` / `popup.css` / `popup.js`：彈出視窗介面及本機儲存功能
- `crypto-utils.js`：裝置金鑰管理、AES-GCM 加密／解密及舊版遷移工具
- `content.js`：在唯一指定的官方頁面填寫欄位
- `result.js`：在指定官方結果頁辨認成功／已使用狀態，不處理 CAPTCHA 或按鈕
- `background.js`：安全接收 `hktr.uk` 傳來的序號並開啟官方頁面

## hktr.uk 網站整合

擴充功能只接受來自以下 HTTPS 網站的外部訊息：

- `https://hktr.uk/*`
- `https://www.hktr.uk/*`

網站需要知道已安裝擴充功能的 ID。開發期間可在 `chrome://extensions` 的「HKTR 序號助手」卡片找到 ID，然後使用 Chrome External Messaging API：

```js
const extensionId = "在這裡填上擴充功能 ID";

chrome.runtime.sendMessage(
  extensionId,
  {
    action: "redeemSerial",
    serialCode: "玩家選擇的序號"
  },
  (response) => {
    if (chrome.runtime.lastError) {
      // 擴充功能可能尚未安裝或未有回應。
      console.error("未能連接 HKTR 序號助手。");
      return;
    }

    if (response?.success) {
      console.log("已開啟官方兌換頁。 ");
    } else {
      console.error(response?.error || "未能處理序號。 ");
    }
  }
);
```

完成一次首次設定後，擴充功能會加密更新 hktr.uk 傳入的序號，再於新分頁開啟官方兌換頁，毋須另行解鎖。hktr.uk 不能透過此外部介面讀取帳號清單、密碼、序號或其他本機資料。

訊息必須剛好包含 `action` 及 `serialCode`，其中 `action` 必須是 `redeemSerial`。序號會移除首尾空白，並拒絕空值、控制字元及超過官方 30 字元限制的內容。額外欄位、其他操作和非白名單來源均會被拒絕。

驗證碼輸入、資料核對及最終提交仍然必須由玩家親自完成。

## 安全問題及貢獻

- 一般問題及改善建議請參閱 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 安全漏洞請勿連同真實帳號、密碼或未使用序號公開張貼，請依照 [SECURITY.md](SECURITY.md) 私下回報。

## 原始碼授權

本專案採用保留權利的 source-available 聲明，並非開源授權。公開原始碼只供透明度、安全審查及個人檢視；不授權第三方複製、修改、重新包裝、重新發佈、製作衍生作品、冒充官方版本，或使用 HKTR／TrRedeem 品牌素材。完整條款請參閱 [LICENSE](LICENSE)。

Copyright © 2026 HKTR contributors. All rights reserved.

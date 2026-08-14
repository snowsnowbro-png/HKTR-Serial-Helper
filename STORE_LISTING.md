# Chrome Web Store 上架資料草稿

## 名稱

HKTR 序號助手

## 簡短介紹

加密儲存及切換多個玩家帳號，協助填寫香港《跑Online》官方序號兌換頁；CAPTCHA 及提交全程由玩家手動完成。

## 詳細介紹

HKTR 序號助手是一個非官方 Chrome 擴充功能，讓香港《跑Online》玩家更方便地使用官方序號兌換頁。

主要功能：

- 加密儲存多個玩家帳號及密碼
- 快速切換目前兌換帳號
- 自動填寫玩家帳號、密碼及序號
- 從 hktr.uk 接收玩家選擇的序號
- Popup 只需設定帳號及密碼，毋須重複輸入序號
- 在官方兌換頁直接切換已儲存帳號而不清除序號
- 記住本機兌換狀態，再次使用相同帳號及序號時作出防重提醒
- 一次同意後直接使用，毋須另設主密碼或每次解鎖
- 隨時清除所有本機資料

帳號、密碼及序號使用目前 Chrome 使用者設定檔專用、不可匯出的 AES-256-GCM 金鑰加密。兌換資料不會傳送給開發者、Base44、廣告商或分析服務。

本擴充功能不會讀取、辨識、繞過或填寫 CAPTCHA，亦不會自動提交表格。玩家必須親自輸入驗證碼、核對資料並提交。

本產品並非由 TalesRunner、《跑Online》、FunTown 或相關權利人開發、認可或營運。

## 單一用途聲明

協助玩家安全保存兌換所需資料，並在指定的香港《跑Online》官方序號兌換頁填寫玩家選擇的帳號、密碼及序號。

## 權限解釋

### storage

用於在玩家目前 Chrome 使用者設定檔內保存加密密碼、玩家帳號、序號、目前選用帳號及私隱同意記錄。不可匯出的裝置金鑰獨立保存於 extension 的 IndexedDB。

### 指定官方頁面內容程式

內容程式只在官方表格頁及其指定結果頁執行，用於填寫帳號、密碼及序號、顯示帳號切換器，以及在官方明確顯示成功或序號已使用後更新本機防重提醒。它不處理 CAPTCHA、不點擊提交按鈕，亦不會在其他網站執行。

### externally_connectable

只允許 `https://hktr.uk/*` 及 `https://www.hktr.uk/*` 在玩家完成首次設定後傳入一個經驗證並立即加密的序號。外部網站不能讀取帳號、密碼、序號或其他本機資料。

### web_accessible_resources

只向 `https://trevent.funtown.com.hk/*` 公開一張 `popup-logo.png`，供官方頁面的帳號切換器顯示品牌標誌。

## Privacy practices 建議申報

- 處理 Authentication information：是（玩家帳號及密碼）
- 處理 Form data：是（玩家輸入的序號及兌換資料）
- 資料用途：Extension functionality
- 出售資料：否
- 用於廣告：否
- 用於信用或借貸：否
- 傳送到開發者／第三方伺服器：否
- Limited Use certification：確認遵守

實際提交時，Dashboard 選項文字可能更新；申報內容必須與最新私隱政策及實際行為一致。

## 所需網址

- 首頁：`https://hktr.uk/trredeem`
- 私隱政策：建議使用 `https://hktr.uk/trredeem/privacy`
- 支援頁：`[請填寫]`

## 發佈前仍要填寫

- 發佈者名稱
- 支援／私隱聯絡電郵
- 公開私隱政策網址
- Chrome Web Store 固定 Item ID
- 至少一張清楚展示 popup 及官方頁面帳號切換器的商店截圖

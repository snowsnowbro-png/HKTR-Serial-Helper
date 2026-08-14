"use strict";

// 官方表格提交後會前往 serial_code_handler.php，並以頁面文字顯示結果。
// 這裡只把有限長度的結果文字交給 extension 背景程式作本機分類；
// 不會讀取 CAPTCHA、不會點擊按鈕，亦不會向任何網站傳送資料。
const resultText = document.body?.innerText?.replace(/\s+/gu, " ").trim().slice(0, 500);

if (resultText) {
  chrome.runtime.sendMessage({
    action: "recordRedemptionResult",
    resultText
  });
}

"use strict";

/*
 * ================================================================
 * 官方表格選擇器設定區
 * ================================================================
 * 每個欄位依次嘗試 selector。主要 selector 使用穩定的 name 及 type
 * 屬性；placeholder 只作後備。這裡刻意沒有 CAPTCHA 或提交按鈕。
 * 官方表格實際 id 是 serial；只監聽 submit 事件作本機防重提醒，
 * 不會阻止、觸發或自動提交表格。
 */
const FORM_SELECTORS = Object.freeze({
  account: Object.freeze([
    'input[name="account"][type="text"]',
    'input[placeholder="輸入玩家帳號"]'
  ]),
  password: Object.freeze([
    'input[name="passward"][type="password"]',
    'input[placeholder="輸入玩家密碼"][type="password"]'
  ]),
  serialCode: Object.freeze([
    'input[name="code"][type="text"]',
    'input[placeholder="輸入序號碼"]'
  ])
});

const MAX_FIELD_LENGTH = 30;
const OFFICIAL_FORM_SELECTOR = 'form#serial[name="serial"]';

// 確認三組 selector 都已設定，避免誤選頁面元素。
function selectorsAreConfigured() {
  return Object.values(FORM_SELECTORS).every(
    (selectors) =>
      Array.isArray(selectors) &&
      selectors.length > 0 &&
      selectors.every(
        (selector) => typeof selector === "string" && selector.trim().length > 0
      )
  );
}

// 依次嘗試主要及後備 selector，並只接受真正的 input 元素。
function findInput(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLInputElement) {
      return element;
    }
  }

  return null;
}

function serialCodeIsValid(serialCode) {
  return (
    typeof serialCode === "string" &&
    serialCode.trim().length > 0 &&
    serialCode.length <= MAX_FIELD_LENGTH
  );
}

function sendInternalMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error("Extension message failed"));
        return;
      }
      resolve(response);
    });
  });
}

// 使用原生 value setter，並通知網站欄位內容已更新。
function setInputValue(element, value) {
  if (!(element instanceof HTMLInputElement)) {
    throw new Error("設定的 selector 沒有指向輸入欄位。 ");
  }

  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;

  if (!valueSetter) {
    throw new Error("瀏覽器不支援設定輸入欄位。 ");
  }

  valueSetter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function getRedemptionWarningHost(serialCodeField) {
  let host = document.querySelector("#hktr-redemption-warning-host");
  if (host) {
    return host;
  }
  host = document.createElement("div");
  host.id = "hktr-redemption-warning-host";
  host.style.display = "none";
  host.style.width = "340px";
  host.style.maxWidth = "100%";
  host.style.margin = "10px auto 0";
  const shadow = host.attachShadow({ mode: "open" });
  const notice = document.createElement("div");
  notice.setAttribute("role", "alert");
  notice.style.cssText = `
    box-sizing: border-box;
    padding: 11px 13px;
    border: 2px solid #d93b4a;
    border-radius: 10px;
    background: #fff1f2;
    color: #8d1825;
    font: 700 13px/1.5 system-ui, -apple-system, "PingFang HK", "Noto Sans TC", sans-serif;
    text-align: left;
  `;
  shadow.append(notice);
  serialCodeField.insertAdjacentElement("afterend", host);
  return host;
}

async function updateRedemptionWarning(account, serialCode, serialCodeField) {
  const host = getRedemptionWarningHost(serialCodeField);
  const notice = host.shadowRoot?.querySelector('[role="alert"]');
  if (!notice || !account?.trim() || !serialCodeIsValid(serialCode)) {
    host.style.display = "none";
    return;
  }
  try {
    const response = await sendInternalMessage({
      action: "getRedemptionStatus",
      account: account.trim(),
      serialCode: serialCode.trim()
    });
    if (response?.status === "redeemed" || response?.status === "already-used") {
      notice.textContent = "⚠️ 提醒：呢個帳號已經兌換過此序號，請勿重複提交。";
      host.style.display = "block";
    } else if (response?.status === "pending") {
      notice.textContent = "⚠️ 呢個帳號最近提交過此序號，請先確認上次結果，避免重複提交。";
      host.style.display = "block";
    } else {
      host.style.display = "none";
    }
  } catch {
    host.style.display = "none";
  }
}

function watchManualSubmission(accountField, serialCodeField) {
  const form = document.querySelector(OFFICIAL_FORM_SELECTOR);
  if (!(form instanceof HTMLFormElement) || form.dataset.hktrAttemptWatcher === "1") {
    return;
  }
  form.dataset.hktrAttemptWatcher = "1";
  form.addEventListener("submit", () => {
    const account = accountField.value.trim();
    const serialCode = serialCodeField.value.trim();
    if (!account || !serialCodeIsValid(serialCode)) {
      return;
    }
    // 只記錄使用者自己觸發的提交；不阻止、不觸發亦不等待官方表格。
    chrome.runtime.sendMessage({
      action: "recordRedemptionAttempt",
      account,
      serialCode
    });
  }, { capture: true });
}

// 在官方帳號欄上方加入 extension 自己的帳號選單。
// 選單使用 Shadow DOM，避免官方頁面的 CSS 改壞版面。
function addAccountSwitcher(
  accounts,
  activeAccountId,
  locked,
  setupRequired,
  accountField,
  passwordField,
  serialCodeField
) {
  if (document.querySelector("#hktr-account-switcher-host")) {
    return;
  }

  const host = document.createElement("div");
  host.id = "hktr-account-switcher-host";
  host.style.display = "block";
  host.style.width = "340px";
  host.style.maxWidth = "100%";
  // 官方輸入欄本身置中；使用 auto margin 令帳號選單對齊表格中央。
  host.style.margin = "0 auto 10px";

  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { color-scheme: light; }
    .panel {
      box-sizing: border-box;
      overflow: hidden;
      border: 2px solid #f28b19;
      border-radius: 14px;
      background: linear-gradient(145deg, #fffaf1 0%, #f3f8ff 100%);
      color: #172033;
      font-family: system-ui, -apple-system, "PingFang HK", "Noto Sans TC", sans-serif;
      text-align: left;
      box-shadow: 0 8px 22px rgba(26, 62, 112, 0.2);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-bottom: 1px solid rgba(242, 139, 25, 0.3);
      background: linear-gradient(90deg, rgba(255, 160, 29, 0.14), rgba(42, 119, 218, 0.12));
    }
    .brand img {
      width: 70px;
      height: 70px;
      object-fit: contain;
      filter: drop-shadow(0 3px 5px rgba(21, 46, 78, 0.18));
    }
    .brand-copy {
      min-width: 0;
    }
    .brand-title {
      margin: 0;
      color: #172033;
      font-size: 16px;
      font-weight: 800;
      line-height: 1.25;
    }
    .brand-tagline {
      margin: 3px 0 0;
      color: #b64d0b;
      font-size: 11px;
      font-weight: 700;
    }
    .controls {
      padding: 11px 12px 10px;
    }
    label {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 800;
    }
    select {
      box-sizing: border-box;
      width: 100%;
      padding: 9px 34px 9px 10px;
      border: 1px solid #8295af;
      border-radius: 8px;
      background: #fff;
      color: #172033;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
    }
    select:focus {
      border-color: #f28b19;
      outline: 3px solid rgba(242, 139, 25, 0.2);
    }
    select:disabled {
      cursor: not-allowed;
      opacity: 0.7;
    }
    .status {
      min-height: 17px;
      margin: 7px 0 0;
      color: #526078;
      font-size: 12px;
      line-height: 1.4;
    }
  `;

  const panel = document.createElement("div");
  panel.className = "panel";

  const brand = document.createElement("div");
  brand.className = "brand";

  const logo = document.createElement("img");
  logo.src = chrome.runtime.getURL("icons/popup-logo.png");
  logo.alt = "TrRedeem 標誌";
  logo.width = 70;
  logo.height = 70;

  const brandCopy = document.createElement("div");
  brandCopy.className = "brand-copy";

  const brandTitle = document.createElement("p");
  brandTitle.className = "brand-title";
  brandTitle.textContent = "HKTR 序號助手";

  const brandTagline = document.createElement("p");
  brandTagline.className = "brand-tagline";
  brandTagline.textContent = "快速切換已儲存帳號";

  brandCopy.append(brandTitle, brandTagline);
  brand.append(logo, brandCopy);

  const controls = document.createElement("div");
  controls.className = "controls";

  const label = document.createElement("label");
  label.htmlFor = "hktr-saved-account";
  label.textContent = "選擇兌換帳號";

  const select = document.createElement("select");
  select.id = "hktr-saved-account";
  select.disabled = accounts.length === 0 || locked;

  if (accounts.length === 0) {
    select.add(new Option(
      setupRequired ? "請先完成首次設定" : "請先儲存玩家帳號",
      ""
    ));
  } else {
    for (const profile of accounts) {
      // Option 以文字方式加入帳號，避免將帳號當成 HTML。
      select.add(new Option(profile.account, profile.id));
    }
    select.value = activeAccountId ?? accounts[0].id;
  }

  const status = document.createElement("p");
  status.className = "status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  if (setupRequired) {
    status.textContent = "請按 Chrome 工具列圖示完成一次設定。";
  } else if (locked) {
    status.textContent = "裝置金鑰無法使用，請開啟序號助手重新設定。";
  } else if (accounts.length > 0) {
    status.textContent = "切換帳號只會更新帳號及密碼，序號會保持不變。";
  } else {
    status.textContent = "未有已儲存帳號。";
  }

  select.addEventListener("change", async () => {
    const selectedProfile = accounts.find(
      (profile) => profile.id === select.value
    );

    if (!selectedProfile) {
      status.textContent = "未能找到所選帳號。";
      return;
    }

    try {
      const response = await sendInternalMessage({
        action: "selectAccount",
        accountId: selectedProfile.id
      });
      if (!response?.success || !response.credentials) {
        status.textContent = response?.error ?? "未能取得所選帳號。";
        return;
      }

      // 只更新這兩個欄位；刻意不讀取或改動序號欄。
      setInputValue(accountField, response.credentials.account.trim());
      setInputValue(passwordField, response.credentials.password);
      status.textContent = "帳號已切換，原有序號已保留。";
      await updateRedemptionWarning(
        response.credentials.account,
        serialCodeField.value,
        serialCodeField
      );
    } catch {
      status.textContent = "未能切換帳號，請重新整理頁面再試。";
    }
  });

  controls.append(label, select, status);
  panel.append(brand, controls);
  shadow.append(style, panel);
  accountField.insertAdjacentElement("beforebegin", host);
}

async function fillRedemptionForm() {
  if (!selectorsAreConfigured()) {
    // 只提示設定尚未完成，不輸出任何玩家資料。
    console.info("HKTR 序號助手：尚未設定官方表格 selector，因此未有自動填寫。 ");
    return;
  }

  try {
    const response = await sendInternalMessage({ action: "getRedemptionData" });
    if (!response?.success) {
      throw new Error("Unable to get redemption data");
    }

    const accountField = findInput(FORM_SELECTORS.account);
    const passwordField = findInput(FORM_SELECTORS.password);
    const serialCodeField = findInput(FORM_SELECTORS.serialCode);

    if (!(accountField instanceof HTMLInputElement) ||
        !(passwordField instanceof HTMLInputElement)) {
      throw new Error("未能找到帳號或密碼欄。 ");
    }

    addAccountSwitcher(
      Array.isArray(response.accounts) ? response.accounts : [],
      response.activeAccountId,
      response.locked === true,
      response.setupRequired === true,
      accountField,
      passwordField,
      serialCodeField
    );

    if (response.credentials) {
      setInputValue(accountField, response.credentials.account.trim());
      setInputValue(passwordField, response.credentials.password);
    }

    if (serialCodeIsValid(response.serialCode)) {
      setInputValue(serialCodeField, response.serialCode.trim());
    }

    if (response.credentials && serialCodeIsValid(response.serialCode)) {
      await updateRedemptionWarning(
        response.credentials.account,
        response.serialCode,
        serialCodeField
      );
    }
    watchManualSubmission(accountField, serialCodeField);

    // 刻意不讀取、不處理驗證碼，亦不會提交表格。
    console.info("HKTR 序號助手：已加入帳號選單，請自行輸入驗證碼並提交。 ");
  } catch {
    // 不輸出錯誤物件，以免第三方頁面意外把敏感內容放入錯誤訊息。
    console.warn("HKTR 序號助手：未能填寫表格，請檢查 selector 是否正確。 ");
  }
}

fillRedemptionForm();

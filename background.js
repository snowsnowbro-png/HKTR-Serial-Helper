"use strict";

importScripts("crypto-utils.js");

const REDEMPTION_URL = "https://trevent.funtown.com.hk/serial/app/serial_code.php";
const ALLOWED_ORIGINS = new Set(["https://hktr.uk", "https://www.hktr.uk"]);
const EXPECTED_EXTERNAL_FIELDS = ["action", "serialCode"];
const MAX_FIELD_LENGTH = 30;
const DEVICE_VAULT_MODE = "device-v1";

function objectHasExactFields(value, expectedFields) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }

  const fields = Object.keys(value).sort();
  const expected = [...expectedFields].sort();
  return (
    fields.length === expected.length &&
    fields.every((field, index) => field === expected[index])
  );
}

function isAllowedSender(sender) {
  if (!sender || typeof sender.url !== "string") {
    return false;
  }

  try {
    const url = new URL(sender.url);
    return (
      url.protocol === "https:" &&
      ALLOWED_ORIGINS.has(url.origin) &&
      (typeof sender.origin !== "string" || sender.origin === url.origin)
    );
  } catch {
    return false;
  }
}

function sanitizeSerialCode(value) {
  if (typeof value !== "string") {
    return null;
  }

  const serialCode = value.trim();
  if (
    serialCode.length === 0 ||
    serialCode.length > MAX_FIELD_LENGTH ||
    /[\u0000-\u001F\u007F]/u.test(serialCode)
  ) {
    return null;
  }
  return serialCode;
}

function isEncryptedProfile(profile) {
  return (
    profile !== null &&
    typeof profile === "object" &&
    typeof profile.id === "string" &&
    profile.id.length > 0 &&
    HKTRCrypto.isEncryptedValue(profile.encryptedCredentials)
  );
}

async function decryptProfile(profile, key) {
  const plainText = await HKTRCrypto.decryptText(profile.encryptedCredentials, key);
  const credentials = JSON.parse(plainText);
  if (
    !credentials ||
    typeof credentials.account !== "string" ||
    credentials.account.trim().length === 0 ||
    credentials.account.length > MAX_FIELD_LENGTH ||
    typeof credentials.password !== "string" ||
    credentials.password.trim().length === 0 ||
    credentials.password.length > MAX_FIELD_LENGTH
  ) {
    throw new Error("Invalid credentials");
  }
  return credentials;
}

// 只接受來自本 extension 內容程式／popup 的內部訊息。
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message !== "object") {
    return false;
  }

  (async () => {
    try {
      if (objectHasExactFields(message, ["action"]) &&
          message.action === "getRedemptionData") {
        const saved = await chrome.storage.local.get([
          "vaultMode",
          "encryptedAccounts",
          "activeAccountId",
          "encryptedSerialCode"
        ]);
        const profiles = Array.isArray(saved.encryptedAccounts)
          ? saved.encryptedAccounts.filter(isEncryptedProfile)
          : [];
        const key = saved.vaultMode === DEVICE_VAULT_MODE
          ? await HKTRCrypto.getDeviceKey()
          : null;
        const decryptedProfiles = [];
        if (key) {
          for (const profile of profiles) {
            const credentials = await decryptProfile(profile, key);
            decryptedProfiles.push({ id: profile.id, ...credentials });
          }
        }
        const accounts = decryptedProfiles.map(({ id, account }) => ({ id, account }));
        const activeProfile = decryptedProfiles.find(
          (profile) => profile.id === saved.activeAccountId
        ) ?? decryptedProfiles[0];
        let credentials = null;
        let serialCode = "";
        if (key && activeProfile) {
          credentials = {
            account: activeProfile.account,
            password: activeProfile.password
          };
        }
        if (key && HKTRCrypto.isEncryptedValue(saved.encryptedSerialCode)) {
          serialCode = await HKTRCrypto.decryptText(saved.encryptedSerialCode, key);
        }

        sendResponse({
          success: true,
          setupRequired: saved.vaultMode !== DEVICE_VAULT_MODE,
          locked: saved.vaultMode === DEVICE_VAULT_MODE && !key,
          accounts,
          activeAccountId: activeProfile?.id ?? saved.activeAccountId ?? null,
          credentials,
          serialCode
        });
        return;
      }

      if (objectHasExactFields(message, ["action", "accountId"]) &&
          message.action === "selectAccount" &&
          typeof message.accountId === "string") {
        const saved = await chrome.storage.local.get(["vaultMode", "encryptedAccounts"]);
        const profiles = Array.isArray(saved.encryptedAccounts)
          ? saved.encryptedAccounts.filter(isEncryptedProfile)
          : [];
        const selected = profiles.find((profile) => profile.id === message.accountId);
        const key = saved.vaultMode === DEVICE_VAULT_MODE
          ? await HKTRCrypto.getDeviceKey()
          : null;

        if (!key) {
          sendResponse({
            success: false,
            setupRequired: saved.vaultMode !== DEVICE_VAULT_MODE,
            error: saved.vaultMode === DEVICE_VAULT_MODE
              ? "裝置金鑰無法使用。"
              : "請先開啟擴充功能完成首次設定。"
          });
          return;
        }
        if (!selected) {
          sendResponse({ success: false, error: "找不到所選帳號。" });
          return;
        }

        const credentials = await decryptProfile(selected, key);
        await chrome.storage.local.set({ activeAccountId: selected.id });
        sendResponse({ success: true, credentials });
        return;
      }

      sendResponse({ success: false, error: "不支援的內部操作。" });
    } catch {
      sendResponse({ success: false, error: "未能處理內部操作。" });
    }
  })();

  return true;
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isAllowedSender(sender)) {
    sendResponse({ success: false, error: "不允許的來源。" });
    return false;
  }

  if (!objectHasExactFields(message, EXPECTED_EXTERNAL_FIELDS)) {
    sendResponse({ success: false, error: "訊息格式不正確。" });
    return false;
  }

  if (message.action !== "redeemSerial") {
    sendResponse({ success: false, error: "不支援的操作。" });
    return false;
  }

  const serialCode = sanitizeSerialCode(message.serialCode);
  if (serialCode === null) {
    sendResponse({ success: false, error: "序號格式不正確。" });
    return false;
  }

  // 外部網站只可以寫入序號；沒有任何讀取帳號或密碼的操作。
  (async () => {
    try {
      const saved = await chrome.storage.local.get("vaultMode");
      if (saved.vaultMode !== DEVICE_VAULT_MODE) {
        sendResponse({
          success: false,
          setupRequired: true,
          error: "請先開啟擴充功能完成首次設定。"
        });
        return;
      }

      const key = await HKTRCrypto.getDeviceKey();
      if (!key) {
        sendResponse({
          success: false,
          error: "裝置金鑰無法使用，請開啟擴充功能重新設定。"
        });
        return;
      }

      const encryptedSerialCode = await HKTRCrypto.encryptText(serialCode, key);
      await chrome.storage.local.set({ encryptedSerialCode });
      await chrome.tabs.create({ url: REDEMPTION_URL });
      sendResponse({ success: true });
    } catch {
      sendResponse({ success: false, error: "未能處理序號。" });
    }
  })();

  return true;
});

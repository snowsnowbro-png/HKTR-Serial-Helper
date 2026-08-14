"use strict";

const REDEMPTION_URL = "https://trevent.funtown.com.hk/serial/app/serial_code.php";
const DEVICE_VAULT_MODE = "device-v1";
const LOCAL_STORAGE_KEYS = [
  "vaultMode",
  "vaultConfig",
  "encryptedAccounts",
  "encryptedSerialCode",
  "activeAccountId",
  "privacyConsent",
  // 舊版本欄位，只用於一次性加密遷移。
  "savedAccounts",
  "account",
  "password",
  "serialCode"
];
const MAX_FIELD_LENGTH = 30;
const MAX_SAVED_ACCOUNTS = 20;

const setupPanel = document.querySelector("#setup-panel");
const migrationPanel = document.querySelector("#migration-panel");
const recoveryPanel = document.querySelector("#recovery-panel");
const appPanel = document.querySelector("#app-panel");
const form = document.querySelector("#details-form");
const accountSelect = document.querySelector("#saved-account");
const accountInput = document.querySelector("#account");
const passwordInput = document.querySelector("#password");
const removeAccountButton = document.querySelector("#remove-account");
const statusElement = document.querySelector("#status");

let vaultKey = null;
let encryptedAccounts = [];
let decryptedAccounts = [];

function showStatus(message, type = "") {
  statusElement.textContent = message;
  statusElement.className = type;
}

function showOnly(panel) {
  for (const candidate of [setupPanel, migrationPanel, recoveryPanel, appPanel]) {
    candidate.classList.toggle("hidden", panel !== candidate);
  }
}

function isValidPlainProfile(profile) {
  return (
    profile !== null &&
    typeof profile === "object" &&
    typeof profile.id === "string" &&
    profile.id.length > 0 &&
    typeof profile.account === "string" &&
    profile.account.trim().length > 0 &&
    profile.account.length <= MAX_FIELD_LENGTH &&
    typeof profile.password === "string" &&
    profile.password.trim().length > 0 &&
    profile.password.length <= MAX_FIELD_LENGTH
  );
}

function isValidEncryptedProfile(profile) {
  return (
    profile !== null &&
    typeof profile === "object" &&
    typeof profile.id === "string" &&
    profile.id.length > 0 &&
    HKTRCrypto.isEncryptedValue(profile.encryptedCredentials)
  );
}

function getLegacyProfiles(saved) {
  const profiles = Array.isArray(saved.savedAccounts)
    ? saved.savedAccounts.filter(isValidPlainProfile).slice(0, MAX_SAVED_ACCOUNTS)
    : [];
  if (profiles.length > 0) {
    return profiles;
  }

  const legacy = {
    id: crypto.randomUUID(),
    account: saved.account,
    password: saved.password
  };
  return isValidPlainProfile(legacy) ? [legacy] : [];
}

async function encryptProfiles(profiles, key) {
  const result = [];
  for (const profile of profiles) {
    result.push({
      id: profile.id,
      encryptedCredentials: await HKTRCrypto.encryptText(
        JSON.stringify({ account: profile.account.trim(), password: profile.password }),
        key
      )
    });
  }
  return result;
}

async function decryptProfiles(profiles, key) {
  const result = [];
  for (const profile of profiles) {
    if (!isValidEncryptedProfile(profile)) {
      continue;
    }
    const credentials = JSON.parse(
      await HKTRCrypto.decryptText(profile.encryptedCredentials, key)
    );
    const decryptedProfile = { id: profile.id, ...credentials };
    if (!isValidPlainProfile(decryptedProfile)) {
      throw new Error("Invalid encrypted profile");
    }
    result.push(decryptedProfile);
  }
  return result;
}

function renderAccountOptions(selectedId = "") {
  accountSelect.replaceChildren(new Option("＋ 新增帳號", ""));
  for (const profile of decryptedAccounts) {
    accountSelect.add(new Option(profile.account, profile.id));
  }
  const selectedExists = decryptedAccounts.some((profile) => profile.id === selectedId);
  accountSelect.value = selectedExists ? selectedId : "";
  removeAccountButton.disabled = !selectedExists;
}

function displaySelectedAccount() {
  const profile = decryptedAccounts.find((candidate) => candidate.id === accountSelect.value);
  accountInput.value = profile?.account ?? "";
  passwordInput.value = profile?.password ?? "";
  removeAccountButton.disabled = !profile;
}

function getValidatedValues() {
  const account = accountInput.value.trim();
  const password = passwordInput.value;
  if (!account || !password.trim()) {
    throw new Error("請填寫玩家帳號及密碼。");
  }
  if ([account, password].some((value) => value.length > MAX_FIELD_LENGTH)) {
    throw new Error("每個欄位最多只可輸入 30 個字元。");
  }
  return { account, password };
}

async function showApp() {
  const saved = await chrome.storage.local.get([
    "encryptedAccounts",
    "activeAccountId"
  ]);
  encryptedAccounts = Array.isArray(saved.encryptedAccounts)
    ? saved.encryptedAccounts.filter(isValidEncryptedProfile).slice(0, MAX_SAVED_ACCOUNTS)
    : [];
  decryptedAccounts = await decryptProfiles(encryptedAccounts, vaultKey);

  const activeProfile = decryptedAccounts.find(
    (profile) => profile.id === saved.activeAccountId
  ) ?? decryptedAccounts[0];
  if (activeProfile && activeProfile.id !== saved.activeAccountId) {
    await chrome.storage.local.set({ activeAccountId: activeProfile.id });
  }

  renderAccountOptions(activeProfile?.id ?? "");
  displaySelectedAccount();
  showOnly(appPanel);
}

async function loadState() {
  try {
    const saved = await chrome.storage.local.get(LOCAL_STORAGE_KEYS);
    if (saved.vaultMode === DEVICE_VAULT_MODE) {
      vaultKey = await HKTRCrypto.getDeviceKey();
      if (!vaultKey) {
        showOnly(recoveryPanel);
        showStatus("找不到裝置金鑰，舊有加密資料不能解密。", "error");
        return;
      }
      await showApp();
      return;
    }

    if (saved.vaultConfig) {
      showOnly(migrationPanel);
      return;
    }

    showOnly(setupPanel);
    if (getLegacyProfiles(saved).length > 0) {
      showStatus("偵測到舊版本帳號；按一次即可自動加密轉移。", "success");
    }
  } catch {
    showOnly(recoveryPanel);
    showStatus("未能讀取裝置加密資料。", "error");
  }
}

document.querySelector("#setup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const saved = await chrome.storage.local.get(LOCAL_STORAGE_KEYS);
    const profiles = getLegacyProfiles(saved);
    vaultKey = await HKTRCrypto.getOrCreateDeviceKey();
    encryptedAccounts = await encryptProfiles(profiles, vaultKey);
    const legacySerialCode = typeof saved.serialCode === "string" ? saved.serialCode.trim() : "";
    const encryptedSerialCode = legacySerialCode
      ? await HKTRCrypto.encryptText(legacySerialCode, vaultKey)
      : null;
    const activeAccountId = encryptedAccounts.some(
      (profile) => profile.id === saved.activeAccountId
    ) ? saved.activeAccountId : encryptedAccounts[0]?.id ?? null;

    await chrome.storage.local.set({
      vaultMode: DEVICE_VAULT_MODE,
      encryptedAccounts,
      encryptedSerialCode,
      activeAccountId,
      privacyConsent: { version: 2, acceptedAt: new Date().toISOString() }
    });
    await chrome.storage.local.remove(["vaultConfig", "savedAccounts", "account", "password", "serialCode"]);
    await chrome.storage.session.clear();
    await showApp();
    showStatus(profiles.length ? "舊帳號已安全轉移，可以直接使用。" : "設定完成，可以直接使用。", "success");
  } catch {
    showStatus("未能建立裝置加密資料，請重試。", "error");
  }
});

document.querySelector("#migration-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const migrationForm = event.currentTarget;
  const passwordField = document.querySelector("#migration-password");
  try {
    const saved = await chrome.storage.local.get(LOCAL_STORAGE_KEYS);
    const oldKey = await HKTRCrypto.unlockVault(passwordField.value, saved.vaultConfig);
    const oldEncrypted = Array.isArray(saved.encryptedAccounts)
      ? saved.encryptedAccounts.filter(isValidEncryptedProfile)
      : [];
    const profiles = await decryptProfiles(oldEncrypted, oldKey);
    const oldSerial = HKTRCrypto.isEncryptedValue(saved.encryptedSerialCode)
      ? await HKTRCrypto.decryptText(saved.encryptedSerialCode, oldKey)
      : "";

    vaultKey = await HKTRCrypto.getOrCreateDeviceKey();
    encryptedAccounts = await encryptProfiles(profiles, vaultKey);
    const encryptedSerialCode = oldSerial
      ? await HKTRCrypto.encryptText(oldSerial, vaultKey)
      : null;
    await chrome.storage.local.set({
      vaultMode: DEVICE_VAULT_MODE,
      encryptedAccounts,
      encryptedSerialCode,
      activeAccountId: saved.activeAccountId ?? profiles[0]?.id ?? null,
      privacyConsent: { version: 2, acceptedAt: new Date().toISOString() }
    });
    await chrome.storage.local.remove(["vaultConfig", "savedAccounts", "account", "password", "serialCode"]);
    await chrome.storage.session.clear();
    migrationForm.reset();
    await showApp();
    showStatus("轉換完成；以後不再需要輸入主密碼。", "success");
  } catch {
    passwordField.value = "";
    showStatus("主密碼不正確或舊密碼庫已損壞。", "error");
  }
});

accountSelect.addEventListener("change", async () => {
  displaySelectedAccount();
  if (accountSelect.value) {
    await chrome.storage.local.set({ activeAccountId: accountSelect.value });
    showStatus("已切換目前使用帳號。", "success");
  } else {
    showStatus("請輸入新帳號資料。");
  }
});

document.querySelector("#new-account").addEventListener("click", () => {
  accountSelect.value = "";
  displaySelectedAccount();
  accountInput.focus();
  showStatus("請輸入新帳號及密碼。");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (!vaultKey) {
      throw new Error("裝置金鑰暫時無法使用。");
    }
    const values = getValidatedValues();
    let profileId = accountSelect.value;
    let profileIndex = decryptedAccounts.findIndex((profile) => profile.id === profileId);
    if (profileIndex === -1) {
      profileIndex = decryptedAccounts.findIndex((profile) => profile.account === values.account);
    }

    const encryptedCredentials = await HKTRCrypto.encryptText(
      JSON.stringify({ account: values.account, password: values.password }),
      vaultKey
    );
    if (profileIndex >= 0) {
      profileId = decryptedAccounts[profileIndex].id;
      decryptedAccounts[profileIndex] = { id: profileId, account: values.account, password: values.password };
      encryptedAccounts[profileIndex] = { id: profileId, encryptedCredentials };
    } else {
      if (encryptedAccounts.length >= MAX_SAVED_ACCOUNTS) {
        throw new Error(`最多只可儲存 ${MAX_SAVED_ACCOUNTS} 個帳號。`);
      }
      profileId = crypto.randomUUID();
      decryptedAccounts.push({ id: profileId, account: values.account, password: values.password });
      encryptedAccounts.push({ id: profileId, encryptedCredentials });
    }

    // 只更新帳號資料；保留由 hktr.uk 傳入的已加密序號。
    await chrome.storage.local.set({ encryptedAccounts, activeAccountId: profileId });
    renderAccountOptions(profileId);
    displaySelectedAccount();
    showStatus("已加密儲存，並設為目前使用帳號。", "success");
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "未能儲存資料。", "error");
  }
});

removeAccountButton.addEventListener("click", async () => {
  const profileId = accountSelect.value;
  if (!profileId) {
    showStatus("請先選擇要刪除的帳號。", "error");
    return;
  }
  try {
    decryptedAccounts = decryptedAccounts.filter((profile) => profile.id !== profileId);
    encryptedAccounts = encryptedAccounts.filter((profile) => profile.id !== profileId);
    const nextProfile = decryptedAccounts[0];
    await chrome.storage.local.set({ encryptedAccounts, activeAccountId: nextProfile?.id ?? null });
    renderAccountOptions(nextProfile?.id ?? "");
    displaySelectedAccount();
    showStatus("已刪除所選帳號。", "success");
  } catch {
    showStatus("未能刪除帳號。", "error");
  }
});

document.querySelector("#open-page").addEventListener("click", async () => {
  await chrome.tabs.create({ url: REDEMPTION_URL });
});

document.querySelector("#clear-data").addEventListener("click", async () => {
  if (!confirm("確定清除所有帳號、加密密碼、序號及裝置金鑰？此操作無法復原。")) {
    return;
  }
  try {
    await HKTRCrypto.deleteDeviceKey();
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    vaultKey = null;
    encryptedAccounts = [];
    decryptedAccounts = [];
    form.reset();
    document.querySelector("#setup-form").reset();
    document.querySelector("#migration-form").reset();
    showOnly(setupPanel);
    showStatus("已清除所有本機資料。", "success");
  } catch {
    showStatus("未能清除資料，請關閉其他助手視窗後重試。", "error");
  }
});

loadState();

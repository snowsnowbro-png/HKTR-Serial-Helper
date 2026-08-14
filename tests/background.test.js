"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const state = {
  local: {},
  session: {},
  openedUrls: []
};
let internalListener;
let externalListener;

function storageArea(area) {
  return {
    async get(keys) {
      if (keys === undefined || keys === null) {
        return { ...state[area] };
      }
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(
        list.filter((key) => Object.hasOwn(state[area], key))
          .map((key) => [key, state[area][key]])
      );
    },
    async set(values) {
      Object.assign(state[area], values);
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete state[area][key];
      }
    }
  };
}

const context = vm.createContext({
  crypto: webcrypto,
  TextEncoder,
  TextDecoder,
  URL,
  btoa: (value) => Buffer.from(value, "binary").toString("base64"),
  atob: (value) => Buffer.from(value, "base64").toString("binary"),
  chrome: {
    runtime: {
      id: "test-extension-id",
      onMessage: { addListener: (listener) => { internalListener = listener; } },
      onMessageExternal: { addListener: (listener) => { externalListener = listener; } }
    },
    storage: {
      local: storageArea("local"),
      session: storageArea("session")
    },
    tabs: {
      async create({ url }) {
        state.openedUrls.push(url);
      }
    }
  }
});

const cryptoSource = fs.readFileSync("crypto-utils.js", "utf8");
const backgroundSource = fs.readFileSync("background.js", "utf8")
  .replace('importScripts("crypto-utils.js");', "")
  // IndexedDB 本身由 Chrome 整合測試；此單元測試注入同一把不可匯出測試金鑰。
  .replaceAll("await HKTRCrypto.getDeviceKey()", "globalThis.testDeviceKey");
vm.runInContext(
  `${cryptoSource}\nglobalThis.cryptoApi = HKTRCrypto;\n${backgroundSource}`,
  context
);

function contextObject(source) {
  return vm.runInContext(`(${source})`, context);
}

function invoke(listener, message, sender) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Listener response timed out")), 2000);
    listener(message, sender, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

(async () => {
  const { config, key } = await context.cryptoApi.createVault(
    "correct horse battery staple"
  );
  const encryptedCredentials = await context.cryptoApi.encryptText(
    JSON.stringify({ account: "player001", password: "secret123" }),
    key
  );
  context.testDeviceKey = key;
  state.local.vaultMode = "device-v1";
  state.local.encryptedAccounts = [{ id: "profile-1", encryptedCredentials }];
  state.local.activeAccountId = "profile-1";
  state.local.encryptedSerialCode = await context.cryptoApi.encryptText("CODE123", key);

  const internalResponse = await invoke(
    internalListener,
    contextObject('{ action: "getRedemptionData" }'),
    { id: "test-extension-id" }
  );
  assert.equal(internalResponse.success, true);
  assert.equal(internalResponse.locked, false);
  assert.deepEqual(JSON.parse(JSON.stringify(internalResponse.accounts)), [
    { id: "profile-1", account: "player001" }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(internalResponse.credentials)), {
    account: "player001",
    password: "secret123"
  });
  assert.equal(internalResponse.serialCode, "CODE123");

  const officialFormSender = {
    id: "test-extension-id",
    url: "https://trevent.funtown.com.hk/serial/app/serial_code.php"
  };
  const attemptResponse = await invoke(
    internalListener,
    contextObject('{ action: "recordRedemptionAttempt", account: "player001", serialCode: "CODE123" }'),
    officialFormSender
  );
  assert.equal(attemptResponse.status, "pending");
  assert.equal(JSON.stringify(state.local.redemptionHistory).includes("player001"), false);
  assert.equal(JSON.stringify(state.local.redemptionHistory).includes("CODE123"), false);

  const pendingResponse = await invoke(
    internalListener,
    contextObject('{ action: "getRedemptionStatus", account: "player001", serialCode: "CODE123" }'),
    officialFormSender
  );
  assert.equal(pendingResponse.status, "pending");

  const resultResponse = await invoke(
    internalListener,
    contextObject('{ action: "recordRedemptionResult", resultText: "序號兌換成功，物品已發送。" }'),
    {
      id: "test-extension-id",
      url: "https://trevent.funtown.com.hk/serial/app/serial_code_handler.php"
    }
  );
  assert.equal(resultResponse.status, "redeemed");

  const redeemedResponse = await invoke(
    internalListener,
    contextObject('{ action: "getRedemptionStatus", account: "player001", serialCode: "CODE123" }'),
    officialFormSender
  );
  assert.equal(redeemedResponse.status, "redeemed");

  const secondAttempt = await invoke(
    internalListener,
    contextObject('{ action: "recordRedemptionAttempt", account: "player001", serialCode: "CODE999" }'),
    officialFormSender
  );
  assert.equal(secondAttempt.status, "pending");
  const failedResult = await invoke(
    internalListener,
    contextObject('{ action: "recordRedemptionResult", resultText: "序號或帳號錯誤(10)。" }'),
    {
      id: "test-extension-id",
      url: "https://trevent.funtown.com.hk/serial/app/serial_code_handler.php"
    }
  );
  assert.equal(failedResult.status, "failed");
  const failedStatus = await invoke(
    internalListener,
    contextObject('{ action: "getRedemptionStatus", account: "player001", serialCode: "CODE999" }'),
    officialFormSender
  );
  assert.equal(failedStatus.status, null);

  await invoke(
    internalListener,
    contextObject('{ action: "recordRedemptionAttempt", account: "player001", serialCode: "USED123" }'),
    officialFormSender
  );
  const alreadyUsedResult = await invoke(
    internalListener,
    contextObject('{ action: "recordRedemptionResult", resultText: "此序號已被使用。" }'),
    {
      id: "test-extension-id",
      url: "https://trevent.funtown.com.hk/serial/app/serial_code_handler.php"
    }
  );
  assert.equal(alreadyUsedResult.status, "already-used");

  const rejectedHistoryOrigin = await invoke(
    internalListener,
    contextObject('{ action: "getRedemptionStatus", account: "player001", serialCode: "CODE123" }'),
    { id: "test-extension-id", url: "https://evil.example/" }
  );
  assert.equal(rejectedHistoryOrigin.success, false);

  delete state.local.vaultMode;
  const setupResponse = await invoke(
    internalListener,
    contextObject('{ action: "getRedemptionData" }'),
    { id: "test-extension-id" }
  );
  assert.equal(setupResponse.setupRequired, true);
  assert.equal(setupResponse.credentials, null);
  assert.equal(setupResponse.serialCode, "");
  assert.deepEqual(JSON.parse(JSON.stringify(setupResponse.accounts)), []);

  const rejectedOrigin = await invoke(
    externalListener,
    contextObject('{ action: "redeemSerial", serialCode: "BAD111" }'),
    { url: "https://evil.example/redeem", origin: "https://evil.example" }
  );
  assert.equal(rejectedOrigin.success, false);
  assert.equal(
    await context.cryptoApi.decryptText(state.local.encryptedSerialCode, key),
    "CODE123"
  );

  const rejectedFields = await invoke(
    externalListener,
    contextObject('{ action: "redeemSerial", serialCode: "BAD222", extra: true }'),
    { url: "https://hktr.uk/trredeem", origin: "https://hktr.uk" }
  );
  assert.equal(rejectedFields.success, false);
  assert.equal(
    await context.cryptoApi.decryptText(state.local.encryptedSerialCode, key),
    "CODE123"
  );

  const rejectedBeforeSetup = await invoke(
    externalListener,
    contextObject('{ action: "redeemSerial", serialCode: "LOCK123" }'),
    { url: "https://hktr.uk/trredeem", origin: "https://hktr.uk" }
  );
  assert.equal(rejectedBeforeSetup.success, false);
  assert.equal(rejectedBeforeSetup.setupRequired, true);
  assert.deepEqual(state.openedUrls, []);

  state.local.vaultMode = "device-v1";

  const accepted = await invoke(
    externalListener,
    contextObject('{ action: "redeemSerial", serialCode: "  NEW789  " }'),
    { url: "https://hktr.uk/trredeem", origin: "https://hktr.uk" }
  );
  assert.deepEqual(JSON.parse(JSON.stringify(accepted)), { success: true });
  assert.equal(
    await context.cryptoApi.decryptText(state.local.encryptedSerialCode, key),
    "NEW789"
  );
  assert.deepEqual(state.openedUrls, [
    "https://trevent.funtown.com.hk/serial/app/serial_code.php"
  ]);

  console.log("background message tests: passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

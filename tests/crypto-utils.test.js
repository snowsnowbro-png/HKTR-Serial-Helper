"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const context = vm.createContext({
  crypto: webcrypto,
  TextEncoder,
  TextDecoder,
  btoa: (value) => Buffer.from(value, "binary").toString("base64"),
  atob: (value) => Buffer.from(value, "base64").toString("binary")
});

const source = fs.readFileSync("crypto-utils.js", "utf8");
vm.runInContext(`${source}\nglobalThis.cryptoApi = HKTRCrypto;`, context);

(async () => {
  const api = context.cryptoApi;
  const masterPassword = "correct horse battery staple";
  const credentials = JSON.stringify({
    account: "player001",
    password: "secret123"
  });

  const { config, key } = await api.createVault(masterPassword);
  const encrypted = await api.encryptText(credentials, key);

  assert.equal(api.isEncryptedValue(encrypted), true);
  assert.equal(JSON.stringify(encrypted).includes("player001"), false);
  assert.equal(JSON.stringify(encrypted).includes("secret123"), false);
  assert.equal(await api.decryptText(encrypted, key), credentials);

  const unlockedKey = await api.unlockVault(masterPassword, config);
  assert.equal(await api.decryptText(encrypted, unlockedKey), credentials);

  const exported = await api.exportSessionKey(unlockedKey);
  const imported = await api.importSessionKey(exported);
  await api.validateKey(config, imported);
  assert.equal(await api.decryptText(encrypted, imported), credentials);

  await assert.rejects(api.unlockVault("wrong password", config));

  const deviceKey = await api.generateDeviceKey();
  assert.equal(deviceKey.extractable, false);
  const deviceEncrypted = await api.encryptText(credentials, deviceKey);
  assert.equal(await api.decryptText(deviceEncrypted, deviceKey), credentials);
  await assert.rejects(webcrypto.subtle.exportKey("raw", deviceKey));
  console.log("crypto-utils tests: passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

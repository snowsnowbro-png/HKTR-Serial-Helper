"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const popupHtml = fs.readFileSync("popup.html", "utf8");
const contentSource = fs.readFileSync("content.js", "utf8");
const resultSource = fs.readFileSync("result.js", "utf8");
const backgroundSource = fs.readFileSync("background.js", "utf8");
const popupSource = fs.readFileSync("popup.js", "utf8");
const cryptoSource = fs.readFileSync("crypto-utils.js", "utf8");

assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ["storage"]);
assert.deepEqual(manifest.externally_connectable.matches, [
  "https://hktr.uk/*",
  "https://www.hktr.uk/*"
]);
assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false);
assert.equal(contentSource.includes("chrome.storage.local"), false);
assert.equal(contentSource.includes("savedAccounts"), false);
assert.equal(contentSource.includes("encryptedAccounts"), false);
assert.equal(contentSource.includes("chrome.storage.local"), false);
assert.equal(resultSource.includes("chrome.storage.local"), false);
assert.equal(backgroundSource.includes("onMessageExternal"), true);
assert.equal(backgroundSource.includes("EXPECTED_EXTERNAL_FIELDS"), true);
assert.equal(backgroundSource.includes("local.set({ serialCode"), false);
assert.equal(backgroundSource.includes("tabs.create"), true);
assert.equal(backgroundSource.includes("captcha"), false);
assert.equal(backgroundSource.includes("submit("), false);
assert.equal(resultSource.includes("click("), false);
assert.equal(resultSource.toLocaleLowerCase().includes("captcha"), true);
assert.equal(backgroundSource.includes("vaultSessionKey"), false);
assert.equal(popupSource.includes("console.log"), false);
assert.equal(popupSource.includes("console.error"), false);
assert.equal(popupHtml.includes('id="serialCode"'), false);
assert.equal(popupSource.includes("values.serialCode"), false);
assert.equal(cryptoSource.includes("extractable:false"), true);
assert.equal(cryptoSource.includes('false,\n      ["encrypt", "decrypt"]'), true);
assert.deepEqual(manifest.content_scripts.map((entry) => entry.matches), [
  ["https://trevent.funtown.com.hk/serial/app/serial_code.php"],
  ["https://trevent.funtown.com.hk/serial/app/serial_code_handler.php"]
]);

// 防止 popup.js 綁定一個在 popup.html 不存在的元素，造成 addEventListener null 錯誤。
const popupSelectorIds = [
  ...popupSource.matchAll(/querySelector\("#([a-zA-Z0-9-]+)"\)/g)
].map((match) => match[1]);
for (const id of popupSelectorIds) {
  assert.match(popupHtml, new RegExp(`id=["']${id}["']`), `Missing popup element #${id}`);
}

console.log("security checks: passed");

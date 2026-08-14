"use strict";

// 共用加密工具：AES-256-GCM，以及舊版主密碼庫的一次性遷移支援。
// 密文可存入 chrome.storage；不可匯出的裝置金鑰則獨立存放於 IndexedDB。
globalThis.HKTRCrypto = (() => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const ITERATIONS = 310000;
  const VERIFIER_TEXT = "HKTR_VAULT_UNLOCKED_V1";
  const DEVICE_DB_NAME = "hktr-device-vault";
  const DEVICE_DB_VERSION = 1;
  const DEVICE_KEY_STORE = "keys";
  const DEVICE_KEY_ID = "device-aes-gcm-v1";

  function bytesToBase64(bytes) {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function deriveKey(masterPassword, saltBase64, iterations = ITERATIONS) {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(masterPassword),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: base64ToBytes(saltBase64),
        iterations,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptText(plainText, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(plainText)
    );

    return {
      version: 1,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext))
    };
  }

  async function decryptText(encryptedValue, key) {
    if (!isEncryptedValue(encryptedValue)) {
      throw new Error("Invalid encrypted value");
    }

    const plainText = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(encryptedValue.iv) },
      key,
      base64ToBytes(encryptedValue.ciphertext)
    );

    return decoder.decode(plainText);
  }

  function isEncryptedValue(value) {
    return (
      value !== null &&
      typeof value === "object" &&
      value.version === 1 &&
      typeof value.iv === "string" &&
      value.iv.length > 0 &&
      typeof value.ciphertext === "string" &&
      value.ciphertext.length > 0
    );
  }

  async function createVault(masterPassword) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltBase64 = bytesToBase64(salt);
    const key = await deriveKey(masterPassword, saltBase64, ITERATIONS);
    const verifier = await encryptText(VERIFIER_TEXT, key);

    return {
      key,
      config: {
        version: 1,
        kdf: "PBKDF2-SHA-256",
        cipher: "AES-256-GCM",
        iterations: ITERATIONS,
        salt: saltBase64,
        verifier
      }
    };
  }

  async function unlockVault(masterPassword, config) {
    if (
      !config ||
      config.version !== 1 ||
      config.kdf !== "PBKDF2-SHA-256" ||
      config.cipher !== "AES-256-GCM" ||
      !Number.isInteger(config.iterations) ||
      config.iterations < 100000 ||
      typeof config.salt !== "string" ||
      !isEncryptedValue(config.verifier)
    ) {
      throw new Error("Invalid vault configuration");
    }

    const key = await deriveKey(masterPassword, config.salt, config.iterations);
    await validateKey(config, key);
    return key;
  }

  async function validateKey(config, key) {
    const verifier = await decryptText(config.verifier, key);
    if (verifier !== VERIFIER_TEXT) {
      throw new Error("Invalid master password");
    }
  }

  async function exportSessionKey(key) {
    const rawKey = await crypto.subtle.exportKey("raw", key);
    return bytesToBase64(new Uint8Array(rawKey));
  }

  async function importSessionKey(value) {
    return crypto.subtle.importKey(
      "raw",
      base64ToBytes(value),
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  }

  function openDeviceKeyDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DEVICE_DB_NAME, DEVICE_DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(DEVICE_KEY_STORE)) {
          request.result.createObjectStore(DEVICE_KEY_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open key database"));
    });
  }

  async function readDeviceKey() {
    const database = await openDeviceKeyDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(DEVICE_KEY_STORE, "readonly");
        const request = transaction.objectStore(DEVICE_KEY_STORE).get(DEVICE_KEY_ID);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error ?? new Error("Unable to read device key"));
        transaction.onabort = () => reject(transaction.error ?? new Error("Key transaction aborted"));
      });
    } finally {
      database.close();
    }
  }

  async function writeDeviceKey(key) {
    const database = await openDeviceKeyDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(DEVICE_KEY_STORE, "readwrite");
        transaction.objectStore(DEVICE_KEY_STORE).put(key, DEVICE_KEY_ID);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save device key"));
        transaction.onabort = () => reject(transaction.error ?? new Error("Key transaction aborted"));
      });
    } finally {
      database.close();
    }
  }

  // extractable:false 防止 extension JavaScript 匯出原始金鑰內容。
  async function generateDeviceKey() {
    return crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function getDeviceKey() {
    const key = await readDeviceKey();
    if (
      key !== null &&
      (typeof key !== "object" || key.type !== "secret" || key.algorithm?.name !== "AES-GCM")
    ) {
      throw new Error("Invalid device key");
    }
    return key;
  }

  async function getOrCreateDeviceKey() {
    const existingKey = await getDeviceKey();
    if (existingKey) {
      return existingKey;
    }

    const newKey = await generateDeviceKey();
    await writeDeviceKey(newKey);
    return newKey;
  }

  async function deleteDeviceKey() {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DEVICE_DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Unable to delete key database"));
      request.onblocked = () => reject(new Error("Key database deletion blocked"));
    });
  }

  return Object.freeze({
    createVault,
    unlockVault,
    validateKey,
    encryptText,
    decryptText,
    isEncryptedValue,
    exportSessionKey,
    importSessionKey,
    generateDeviceKey,
    getDeviceKey,
    getOrCreateDeviceKey,
    deleteDeviceKey
  });
})();

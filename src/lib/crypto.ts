
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
}

export async function exportPublicKey(key: CryptoKey): Promise<ArrayBuffer> {
  return await window.crypto.subtle.exportKey("spki", key);
}

export async function importPublicKey(keyData: ArrayBuffer): Promise<CryptoKey> {
  return await window.crypto.subtle.importKey(
    "spki",
    keyData,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

export async function deriveSecretKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return await window.crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptData(data: ArrayBuffer | string, key: CryptoKey): Promise<{ iv: Uint8Array, encryptedData: ArrayBuffer }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedData = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  
  const encryptedData = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedData
  );
  
  return { iv, encryptedData };
}

export async function decryptData(encryptedData: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
  return await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encryptedData
  );
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

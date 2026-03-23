const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let wrappingKey: CryptoKey | null = null;
let encryptedPrivateKey: Uint8Array | null = null;
let encryptedIv: Uint8Array | null = null;

const ensureWrappingKey = async (): Promise<CryptoKey> => {
  if (wrappingKey) return wrappingKey;
  if (!window.crypto?.subtle) {
    throw new Error("Web Crypto API is not available in this browser.");
  }
  wrappingKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return wrappingKey;
};

export const secureKeyVault = {
  isSupported(): boolean {
    return Boolean(window.crypto?.subtle);
  },

  hasKey(): boolean {
    return Boolean(wrappingKey && encryptedPrivateKey && encryptedIv);
  },

  async store(privateKey: string): Promise<void> {
    const normalized = String(privateKey || "").trim();
    if (!normalized) throw new Error("Private key is empty.");
    const key = await ensureWrappingKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      textEncoder.encode(normalized)
    );
    encryptedPrivateKey = new Uint8Array(ciphertext);
    encryptedIv = iv;
  },

  async read(): Promise<string | null> {
    if (!wrappingKey || !encryptedPrivateKey || !encryptedIv) return null;
    const plaintext = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: encryptedIv },
      wrappingKey,
      encryptedPrivateKey
    );
    return textDecoder.decode(plaintext);
  },

  clear(): void {
    wrappingKey = null;
    encryptedPrivateKey = null;
    encryptedIv = null;
  }
};


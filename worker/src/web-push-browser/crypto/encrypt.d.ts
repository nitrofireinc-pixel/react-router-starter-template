import type { PushNotificationSubscription } from "../types.js";
type EncryptionOptions = {
    algorithm: "aesgcm" | "aes128gcm";
    salt?: ArrayBuffer;
    appServerKeyPair?: CryptoKeyPair;
};
/**
 * Encrypt a plaintext payload using the keys provided by the PushSubscription.
 * @param payload - The plaintext payload to encrypt.
 * @param keys - The keys from the PushSubscription.
 * @param options - Options for encryption. Defaults to AES128GCM if not specified.
 */
export declare function encryptPayload(payload: string, keys: PushNotificationSubscription["keys"], options: EncryptionOptions): Promise<{
    encrypted: Uint8Array;
    salt: Uint8Array;
    appServerPublicKey: CryptoKey;
    sharedSecret: ArrayBuffer;
    prk: Uint8Array;
    ikm: Uint8Array;
    cek: Uint8Array;
    nonce: Uint8Array;
}>;
export {};

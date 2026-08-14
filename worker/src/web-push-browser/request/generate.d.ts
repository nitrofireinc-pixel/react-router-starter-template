type BaseOptions = {
    ttl?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
};
type AESGCMOptions = BaseOptions & {
    algorithm: "aesgcm";
    salt: ArrayBuffer;
    appServerPubKey: CryptoKey;
};
type AES128GCMOptions = BaseOptions & {
    algorithm?: "aes128gcm";
};
type EncryptionOptions = AESGCMOptions | AES128GCMOptions;
/**
 * Generate the headers for a Web Push request.
 * @param publicVapidKey - The public VAPID key.
 * @param jwt - The signed JWT token.
 * @param encryptedPayload - The encrypted payload.
 * @param options - Options for encryption and additional headers. Defaults to AES128GCM if not specified.
 * @returns The generated headers.
 */
export declare function generateHeaders(publicVapidKey: CryptoKey, jwt: string, encryptedPayload: ArrayBuffer, options?: EncryptionOptions): Promise<Headers>;
export {};

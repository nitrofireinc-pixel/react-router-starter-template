/**
 * Generate a new pair of VAPID keys.
 * @returns A new pair of VAPID keys.
 */
export declare function generateVapidKeys(): Promise<{
    publicKey: CryptoKey;
    privateKey: CryptoKey;
}>;
/**
 * Serialize a pair of VAPID keys to a format that can be stored or transmitted.
 *
 * Public & private keys are exported in the RAW and PKCS8 formats, respectively.
 * @param keyPair - The keys to serialize.
 * @returns The serialized keys (in base64url format).
 */
export declare function serializeVapidKeys(keyPair: CryptoKeyPair): Promise<{
    publicKey: string;
    privateKey: string;
}>;
/**
 * Deserialize a pair of VAPID keys from a serialized format.
 *
 * Public & private keys are imported from the RAW and PKCS8 formats, respectively.
 * @param keyPair - The serialized keys (in base64url format).
 * @returns The deserialized keys.
 */
export declare function deserializeVapidKeys(keyPair: {
    publicKey: string;
    privateKey: string;
}): Promise<{
    publicKey: CryptoKey;
    privateKey: CryptoKey;
}>;

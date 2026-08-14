export declare function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array>;
export declare function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array>;
export declare function concat(...arrays: Uint8Array[]): Uint8Array;
type HeaderType = {
    algorithm: "aesgcm";
    clientPublicKey: ArrayBuffer;
    localPublicKey: ArrayBuffer;
} | {
    algorithm: "aes128gcm";
    clientPublicKey: ArrayBuffer;
    localPublicKey: ArrayBuffer;
    salt: ArrayBuffer;
};
export declare function createHeader(opts: HeaderType): Uint8Array;
type NonceType = {
    algorithm: "aesgcm";
    clientPublicKey: ArrayBuffer;
    localPublicKey: ArrayBuffer;
} | {
    algorithm: "aes128gcm";
};
export declare function createNonceInfo(opts: NonceType): Uint8Array;
export declare function createCEKInfo(algorithm: "aesgcm" | "aes128gcm"): Uint8Array;
export {};

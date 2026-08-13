/**
 * Convert a string or ArrayBuffer to a base64url encoded string
 * @param data - The data to encode.
 * @returns The base64url encoded string.
 */
export declare function toBase64Url<T extends string | ArrayBuffer | ArrayBufferView>(data: T): string;
/**
 * Convert a base64url encoded string to an ArrayBuffer
 * @param base64 - The base64url encoded string.
 * @returns The ArrayBuffer.
 */
export declare function fromBase64Url(base64: string): ArrayBuffer;

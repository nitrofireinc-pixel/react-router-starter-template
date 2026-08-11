/**
 * Generate and sign a JWT token.
 *
 * To be used in the `Authorization` header of a POST request to a web Push API endpoint.
 * @param privateVapidKey - The private key to sign the JWT with.
 * @param endpoint - The URL of the web Push API endpoint.
 * @param email - The email address to use as the `sub` claim. For example, `support@website.com`.
 * @returns
 */
export declare function createJWT(privateVapidKey: CryptoKey, endpoint: URL, email: string): Promise<string>;

import type { PushNotificationSubscription } from "../types.js";
type EncryptionOptions = {
    algorithm: "aesgcm" | "aes128gcm";
    urgency?: "very-low" | "low" | "normal" | "high";
    ttl?: number;
    salt?: ArrayBuffer;
};
/**
 * Send a push notification to a user.
 * @param vapidKeys - The VAPID keys to use for the request.
 * @param subscription - The PushSubscription to send the notification to.
 * @param email - The email address to use as the `sub` claim in the JWT. For example, `support@website.com`.
 * @param payload - The payload to send in the notification.
 * @param options - Options for encryption and additional headers. Defaults to AES128GCM if not specified.
 * @returns The response from the push service.
 * @throws If any of the keys are unable to be parsed.
 */
export declare function sendPushNotification(vapidKeys: CryptoKeyPair, subscription: PushNotificationSubscription, email: string, payload: string, options?: EncryptionOptions): Promise<Response>;
export {};

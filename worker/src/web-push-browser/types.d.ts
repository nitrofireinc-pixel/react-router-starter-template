export interface PushNotificationOptions {
    sub: PushSubscription;
    email: string;
    payload: string;
    ttl: number;
}
export interface PushNotificationSubscription {
    endpoint: string;
    keys: {
        p256dh: string | ArrayBuffer;
        auth: string | ArrayBuffer;
    };
}

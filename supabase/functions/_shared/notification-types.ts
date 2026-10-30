export type PushSubscription = {
    endpoint: string;
    keys: { p256dh: string; auth: string };
};
export type PushOptions = {
    TTL: number;
    timeout: number;
    vapidDetails: { subject: string; publicKey: string; privateKey: string };
};

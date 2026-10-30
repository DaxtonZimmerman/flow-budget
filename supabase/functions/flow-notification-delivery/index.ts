import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import webpush from "npm:web-push@3.6.7";
import { deliverNotifications } from "./handler.mjs";
import type { PushSubscription, PushOptions } from "../_shared/notification-types.ts";
Deno.serve(request => deliverNotifications(request, {
    env: (name: string) => Deno.env.get(name),createClient,
    send: (subscription: PushSubscription, payload: string, options: PushOptions) => webpush.sendNotification(subscription,payload,options)
}));

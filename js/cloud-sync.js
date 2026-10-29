var flowStorage = typeof flowStorage !== 'undefined' ? flowStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
/* One saved account, with an offline working copy and protected recovery copies. */

let flowClient;
let flowAuthStorage;
let flowSyncing = false;
let flowSyncAgain = false;
let flowViewRefreshPending = false;

function flowViewIsBeingEdited() {
    return Boolean(document.querySelector('dialog[open], #transaction-details-dialog[open], #payday-dialog[open], #transaction-form, #setup-form') ||
        typeof window.hasFlowReviewDraft === 'function' && window.hasFlowReviewDraft());
}
function flushFlowDataViews() {
    if (!flowViewRefreshPending || flowViewIsBeingEdited()) return;
    flowViewRefreshPending = false;
    document.dispatchEvent(new Event('flow-transaction-view-refresh'));
}
function refreshFlowDataViews() {
    flowViewRefreshPending = true;
    document.dispatchEvent(new Event('flow-transaction-data-updated'));
    flushFlowDataViews();
}
document.addEventListener('close', flushFlowDataViews, true);
document.addEventListener('flow-cloud-ready', flushFlowDataViews);

async function flowAuthFetch(input, options = {}) {
    const requestUrl = typeof input === 'string' ? input : input.url;
    const url = new URL(requestUrl, flowCloudUrl);
    if (url.origin !== new URL(flowCloudUrl).origin || !url.pathname.startsWith('/auth/v1/') ||
        typeof AbortController === 'undefined') return fetch(input, options);
    const controller = new AbortController(), previousSignal = options.signal || input?.signal;
    const cancel = () => controller.abort();
    if (previousSignal?.aborted) cancel();
    else previousSignal?.addEventListener('abort', cancel, { once:true });
    const timeout = setTimeout(cancel, 8000);
    try { return await fetch(input, { ...options, signal:controller.signal }); }
    finally { clearTimeout(timeout); previousSignal?.removeEventListener('abort', cancel); }
}

function getFlowClient() {
    if (typeof flowDemoMode !== 'undefined' && flowDemoMode) return null;
    if (!flowCloudUrl || !flowCloudKey || typeof supabase === "undefined") {
        return null;
    }

    if (!flowClient) {
        flowAuthStorage = typeof createFlowAuthStorage === 'function' ? createFlowAuthStorage() : localStorage;
        flowClient = supabase.createClient(flowCloudUrl, flowCloudKey, {
            global: { fetch:flowAuthFetch },
            auth: { persistSession:true, autoRefreshToken:true, storage:flowAuthStorage }
        });
    }

    return flowClient;
}


function getFlowSnapshot() {
    return {
        clientSchemaVersion: 2,
        transactions: JSON.parse(flowStorage.getItem("transactions")) || [],
        budgets: JSON.parse(flowStorage.getItem("budgets")) || [],
        budgetsByMonth: JSON.parse(flowStorage.getItem("budgetsByMonth")) || {},
        categoryRules: JSON.parse(flowStorage.getItem("categoryRules")) || [],
        recurringItems: JSON.parse(flowStorage.getItem("recurringItems")) || [],
        bankAccounts: JSON.parse(flowStorage.getItem("bankAccounts")) || [],
        flowPlanning: typeof loadFlowPlanning === "function" ? loadFlowPlanning() : JSON.parse(flowStorage.getItem("flowPlanning") || "null")
    };
}


function validateFlowSnapshot(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Could not open this saved account.');
    if (data.clientSchemaVersion !== undefined && ![1, 2].includes(data.clientSchemaVersion)) throw new Error('Update Flow before opening this newer workspace.');
    if (typeof validFlowTransactionExtras === 'function' && (!Array.isArray(data.transactions || []) || (data.transactions || []).some(t => !validFlowTransactionExtras(t)))) throw new Error('Unsupported transaction details. Download your saved copy before replacing data.');
    if (data.flowPlanning && typeof validFlowPlanning === "function" && !validFlowPlanning(data.flowPlanning)) throw new Error("Unsupported payday plan. Download your cloud copy before replacing data.");
    if (data.bankAccounts && typeof validBankAccounts === "function" && !validBankAccounts(data.bankAccounts)) throw new Error("Invalid account snapshot.");
}

function replaceFlowSnapshot(data) {
    validateFlowSnapshot(data);
    const oldData = {
        transactions: flowStorage.getItem("transactions"),
        budgets: flowStorage.getItem("budgets"),
        budgetsByMonth: flowStorage.getItem("budgetsByMonth"),
        categoryRules: flowStorage.getItem("categoryRules"),
        recurringItems: flowStorage.getItem("recurringItems"),
        bankAccounts: flowStorage.getItem("bankAccounts"),
        flowPlanning: flowStorage.getItem("flowPlanning")
    };

    try {
        flowStorage.setItem("transactions", JSON.stringify(data.transactions || []));
        flowStorage.setItem("budgets", JSON.stringify(data.budgets || []));
        flowStorage.setItem("budgetsByMonth", JSON.stringify(data.budgetsByMonth || {}));
        flowStorage.setItem("categoryRules", JSON.stringify(data.categoryRules || []));
        flowStorage.setItem("recurringItems", JSON.stringify(data.recurringItems || []));
        flowStorage.setItem("bankAccounts", JSON.stringify(data.bankAccounts || []));
        if (data.flowPlanning) flowStorage.setItem("flowPlanning", JSON.stringify(data.flowPlanning));
        else flowStorage.removeItem("flowPlanning");
    } catch (error) {
        for (const key of Object.keys(oldData)) {
            if (oldData[key] === null) flowStorage.removeItem(key);
            else flowStorage.setItem(key, oldData[key]);
        }

        throw error;
    }
}

const flowWorkspaceKeys = ['transactions', 'budgets', 'budgetsByMonth', 'categoryRules', 'recurringItems', 'bankAccounts', 'flowPlanning',
    'flow_user_id', 'flow_revision', 'flow_pending', 'flow_pending_client', 'flowLastEstimate'];
const flowRecoveryKey = owner => 'flow_recovery_v1:' + (owner || 'unlinked');
const flowServerRecoveryKey = 'flow_server_recovery_v1';

function flowServerRecoverySource() {
    return typeof flowRecoverySourceProject === 'string' && /^[a-z]{20}$/.test(flowRecoverySourceProject)
        ? flowRecoverySourceProject : null;
}

function readFlowServerRecovery() {
    const text = flowStorage.getItem(flowServerRecoveryKey);
    if (!text) return null;
    const row = JSON.parse(text);
    if (row.version !== 1 || row.source !== flowServerRecoverySource() || !row.owner || !row.copyId) {
        throw new Error('Your saved recovery copy has been left untouched.');
    }
    return row;
}

async function prepareFlowServerRecovery() {
    const source = flowServerRecoverySource();
    if (!source || readFlowServerRecovery()) return;
    const owner = flowStorage.getItem('flow_user_id');
    if (!owner || !hasFlowSavedWork()) return;
    const snapshot = getFlowSnapshot();
    keepFlowRecoveryCopy(owner, snapshot, 'server-recovery');
    const copies = readFlowRecoveryCopies(owner);
    const copy = copies.find(row => JSON.stringify(row.data) === JSON.stringify(snapshot));
    let email = null;
    // The cached, previously verified identity is used only for local ownership matching.
    // Fresh authentication on the replacement server is still required.
    if (flowStorage.getItem('flow_verified_user') === owner) {
        try {
            const storage = flowAuthStorage || localStorage;
            const session = JSON.parse(await storage.getItem('sb-' + source + '-auth-token'));
            if (session?.user?.id === owner && session.user.email_confirmed_at && typeof session.user.email === 'string') {
                email = session.user.email.trim().toLowerCase();
            }
        } catch (_) { /* Missing old identity requires a protected recovery screen. */ }
    }
    flowStorage.setItem(flowServerRecoveryKey, JSON.stringify({ version:1, source, owner, email, copyId:copy.id }));
}

function hasFlowSavedWork() {
    return flowWorkspaceKeys.slice(0, 7).some(key => {
        const value = flowStorage.getItem(key);
        return value && !['[]', '{}', 'null'].includes(value);
    });
}

function flowRecoveryRequired() {
    const error = new Error('Your saved data is protected while we restore your account.');
    error.code = 'FLOW_RECOVERY_REQUIRED';
    return error;
}

function readFlowRecoveryCopies(owner) {
    const text = flowStorage.getItem(flowRecoveryKey(owner));
    if (!text) return [];
    const rows = JSON.parse(text);
    if (!Array.isArray(rows) || rows.some(row => row.owner !== (owner || null) || !row.data || row.version !== 1)) throw new Error('Earlier changes could not be read. They have been left untouched.');
    return rows;
}

function getFlowRecoveryCopies(owner) {
    if (!owner || flowStorage.getItem('flow_user_id') !== owner ||
        window.FlowAuth && (!window.FlowAuth.authorized || window.FlowAuth.user?.id !== owner)) return [];
    const copies = readFlowRecoveryCopies(owner);
    const migration = flowServerRecoverySource() && readFlowServerRecovery();
    if (migration?.destination === owner && migration.owner !== owner) {
        return [...copies, ...readFlowRecoveryCopies(migration.owner).map(row => ({ ...row, owner }))];
    }
    return copies;
}

function keepFlowRecoveryCopy(owner, snapshot, reason) {
    const rows = readFlowRecoveryCopies(owner);
    const signature = JSON.stringify(snapshot);
    if (rows.some(row => JSON.stringify(row.data) === signature)) return;
    // Do not prune unsynced work or proceed if storage cannot protect it.
    rows.push({ version:1, owner:owner || null, id:Date.now().toString(36) + Math.random().toString(36).slice(2, 9),
        savedAt:new Date().toISOString(), reason, data:snapshot });
    flowStorage.setItem(flowRecoveryKey(owner), JSON.stringify(rows));
}

function acceptFlowAccountCopy(owner, revision, data, options = {}) {
    validateFlowSnapshot(data);
    const previousOwner = flowStorage.getItem('flow_user_id');
    if (previousOwner !== options.expectedOwner || window.FlowAuth &&
        (!window.FlowAuth.authorized || window.FlowAuth.user?.id !== owner)) return false;
    const previous = Object.fromEntries(flowWorkspaceKeys.map(key => [key, flowStorage.getItem(key)]));
    const snapshot = getFlowSnapshot();
    if (options.expectedSnapshot !== undefined && JSON.stringify(snapshot) !== options.expectedSnapshot) return false;
    const changed = JSON.stringify(snapshot) !== JSON.stringify(data);
    if (options.recover && changed) keepFlowRecoveryCopy(previousOwner, snapshot, options.reason || 'account-update');
    try {
        // A changed account is never exposed under the previous owner's marker.
        if (previousOwner !== owner) flowStorage.removeItem('flow_user_id');
        replaceFlowSnapshot(data);
        flowStorage.setItem('flow_revision', String(revision));
        flowStorage.removeItem('flow_pending');
        flowStorage.removeItem('flow_pending_client');
        if (previousOwner !== owner) flowStorage.removeItem('flowLastEstimate');
        flowStorage.setItem('flow_user_id', owner);
    } catch (error) {
        for (const key of flowWorkspaceKeys) {
            try { previous[key] === null ? flowStorage.removeItem(key) : flowStorage.setItem(key, previous[key]); } catch (_) { /* The protected recovery copy remains available. */ }
        }
        throw error;
    }
    refreshFlowDataViews();
    if (options.recover && changed) document.dispatchEvent(new Event('flow-recovery-updated'));
    return true;
}

async function connectFlowAccount(user) {
    const client = getFlowClient();
    if (!client || !user?.id || !navigator.onLine) throw new Error('Reconnect to open your saved account.');
    const previousOwner = flowStorage.getItem('flow_user_id');
    if (previousOwner === user.id) return true;
    const snapshot = JSON.stringify(getFlowSnapshot());
    const hasEarlierWork = hasFlowSavedWork();
    const verified = await client.auth.getUser();
    if (verified.error || verified.data?.user?.id !== user.id) throw new Error('Sign in again to open Flow.');
    // Another device may already have recovered this signed-in account. Opening
    // its owner-protected server copy does not require importing old local data.
    let cloud = await getCloudData(client, user.id);
    const migration = flowServerRecoverySource() && readFlowServerRecovery();
    let restore = false;
    if (migration && !migration.destination) {
        const current = verified.data.user;
        restore = Boolean(migration.email && current.email_confirmed_at && typeof current.email === 'string' &&
            current.email.trim().toLowerCase() === migration.email && previousOwner === migration.owner);
        if (!restore && !cloud) throw flowRecoveryRequired();
    } else if (flowServerRecoverySource() && hasEarlierWork && !migration && !cloud) {
        // Never infer ownership from an ID or a workspace alone.
        throw flowRecoveryRequired();
    }
    if (restore && !cloud) {
        if (flowStorage.getItem('flow_user_id') !== previousOwner || JSON.stringify(getFlowSnapshot()) !== snapshot ||
            window.FlowAuth && (!window.FlowAuth.authorized || window.FlowAuth.user?.id !== user.id)) {
            throw new Error('Flow changed while restoring. Please try again.');
        }
        const data = JSON.parse(snapshot);
        validateFlowSnapshot(data);
        const revision = await saveCloudData(client, 0, data);
        cloud = { revision, data };
    }
    const opened = acceptFlowAccountCopy(user.id, cloud?.revision || 0, cloud?.data || {
        clientSchemaVersion:2, transactions:[], budgets:[], budgetsByMonth:{}, categoryRules:[], recurringItems:[], bankAccounts:[], flowPlanning:null
    }, { expectedOwner:previousOwner, expectedSnapshot:snapshot, recover:hasEarlierWork, reason:'account-open' });
    if (!opened) throw new Error('Flow changed while opening. Please try again.');
    if (restore) flowStorage.setItem(flowServerRecoveryKey, JSON.stringify({ ...migration, destination:user.id }));
    return true;
}


function showFlowStatus(message) {
    let status = document.querySelector("#flow-sync-status");

    if (!status && document.body) {
        const main = document.querySelector(".main");

        if (main) {
            status = document.createElement("p");
            status.id = "flow-sync-status";
            status.className = "account-status";
            status.setAttribute("aria-live", "polite");
            main.prepend(status);
        }
    }

    if (status) {
        status.textContent = message;
    }
}


function flowDataChanged() {
    if (!flowStorage.getItem("flow_user_id")) {
        return;
    }

    if (flowStorage.getItem('flow_pending') !== '1') flowStorage.setItem('flow_pending_client', '2');
    flowStorage.setItem("flow_pending", "1");
    showFlowStatus("Saving changes…");
    return flowSync();
}


// IMPORTANT: Async/API request. await waits for Supabase data; a failed request throws an error for the caller to handle.
async function getCloudData(client, userId) {
    let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
        const error=new Error('Your account took too long to open. Please try again.');
        error.name='AuthRetryableFetchError';reject(error);
    },10000);});
    let result;
    try {
        result=await Promise.race([client.from("flow_data").select("revision,data").eq("user_id",userId).maybeSingle(),timeout]);
    } finally {clearTimeout(timer);}

    if (result.error) {
        throw result.error;
    }

    return result.data;
}


async function saveCloudData(client, revision, data) {
    const result = await client.rpc("save_flow_data", {
        expected_revision: revision,
        new_data: data
    });

    if (result.error) {
        throw result.error;
    }

    return result.data;
}


async function flowSync(retry = 0) {
    const attempt = Number.isInteger(retry) ? retry : 0;
    if (window.FlowAuth) {
        await window.FlowAuth.ready;
        if (!window.FlowAuth.authorized) return;
    }
    const client = getFlowClient();
    const linkedUserId = flowStorage.getItem("flow_user_id");

    if (!client || !linkedUserId) return;

    if (flowSyncing) {
        flowSyncAgain = true;
        return;
    }

    if (!navigator.onLine) {
        showFlowStatus("Offline. Changes are saved on this device.");
        return;
    }

    flowSyncing = true;
    let cloudReady = false;
    let retryConflict = false;

    try {
        const userResult = await client.auth.getUser();
        const user = userResult.data.user;

        if (userResult.error || !user || user.id !== linkedUserId) {
            showFlowStatus("Sign in on the Account page to sync.");
            return;
        }
        if (flowStorage.getItem('flow_user_id') !== linkedUserId) return;

        const cloud = await getCloudData(client, linkedUserId);
        if (flowStorage.getItem('flow_user_id') !== linkedUserId) return;
        const cloudRevision = cloud ? cloud.revision : 0;
        const localRevision = Number(flowStorage.getItem("flow_revision") || 0);

        if (flowStorage.getItem("flow_pending") === "1") {
            const olderEdits = cloud?.data?.clientSchemaVersion === 2 && flowStorage.getItem('flow_pending_client') !== '2';
            if (olderEdits || cloudRevision !== localRevision) {
                cloudReady = acceptFlowAccountCopy(linkedUserId, cloudRevision, cloud?.data || {
                    clientSchemaVersion:2, transactions:[], budgets:[], budgetsByMonth:{}
                }, { expectedOwner:linkedUserId, recover:true, reason:olderEdits ? 'older-version' : 'simultaneous-changes' });
                if (cloudReady) showFlowStatus('Account updated. Earlier edits are kept in Backup & restore.');
                return cloudReady;
            }

            const snapshot = getFlowSnapshot();
            if (window.FlowAuth && (!window.FlowAuth.authorized || window.FlowAuth.user?.id !== linkedUserId)) return;
            const revision = await saveCloudData(client, localRevision, snapshot);
            if (flowStorage.getItem('flow_user_id') !== linkedUserId) return;
            flowStorage.setItem("flow_revision", String(revision));

            if (JSON.stringify(getFlowSnapshot()) === JSON.stringify(snapshot)) {
                flowStorage.removeItem("flow_pending");
                flowStorage.removeItem('flow_pending_client');
                showFlowStatus("All changes saved.");
                cloudReady = true;
            } else {
                showFlowStatus("Saving new changes…");
                setTimeout(flowSync, 0);
            }

        } else if (cloudRevision > localRevision) {
            cloudReady = acceptFlowAccountCopy(linkedUserId, cloudRevision, cloud.data, { expectedOwner:linkedUserId });
            if (cloudReady) showFlowStatus('All changes saved.');
        } else if (cloudRevision < localRevision) {
            cloudReady = acceptFlowAccountCopy(linkedUserId, cloudRevision, cloud?.data || {
                clientSchemaVersion:2, transactions:[], budgets:[], budgetsByMonth:{}
            }, { expectedOwner:linkedUserId, recover:true, reason:'account-reset' });
            if (cloudReady) showFlowStatus('Account updated. Earlier edits are kept in Backup & restore.');
        } else {
            showFlowStatus("All changes saved.");
            cloudReady = true;
        }

    } catch (error) {
        retryConflict = attempt < 1 && /conflict|data changed/i.test(error.message || '');
        showFlowStatus(retryConflict ? 'Catching up with your account…' : 'Could not sync yet. Your changes are still saved here.');
    } finally {
        flowSyncing = false;

        if (flowSyncAgain && !retryConflict) {
            flowSyncAgain = false;
            setTimeout(flowSync, 0);
        }

        if (cloudReady && flowStorage.getItem('flow_user_id') === linkedUserId) {
            document.dispatchEvent(new Event("flow-cloud-ready"));
        }
    }
    if (retryConflict) { flowSyncAgain = false; return flowSync(attempt + 1); }
    return cloudReady;
}


window.addEventListener("online", flowSync);
document.addEventListener("visibilitychange", function() {
    if (!document.hidden) {
        flowSync();
    }
});
document.addEventListener("DOMContentLoaded", flowSync);
document.addEventListener('flow-auth-ready', flowSync);

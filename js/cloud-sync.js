var flowStorage = typeof flowStorage !== 'undefined' ? flowStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
/* keep one browser copy and one cloud copy */

let flowClient;
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

function getFlowClient() {
    if (typeof flowDemoMode !== 'undefined' && flowDemoMode) return null;
    if (!flowCloudUrl || !flowCloudKey || typeof supabase === "undefined") {
        return null;
    }

    if (!flowClient) {
        flowClient = supabase.createClient(flowCloudUrl, flowCloudKey);
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


function replaceFlowSnapshot(data) {
    if (data.clientSchemaVersion !== undefined && ![1, 2].includes(data.clientSchemaVersion)) throw new Error('Update Flow before opening this newer workspace.');
    if (typeof validFlowTransactionExtras === 'function' && (!Array.isArray(data.transactions || []) || (data.transactions || []).some(t => !validFlowTransactionExtras(t)))) throw new Error('Unsupported transaction details. Download your saved copy before replacing data.');
    if (data.flowPlanning && typeof validFlowPlanning === "function" && !validFlowPlanning(data.flowPlanning)) throw new Error("Unsupported payday plan. Download your cloud copy before replacing data.");
    if (data.bankAccounts && typeof validBankAccounts === "function" && !validBankAccounts(data.bankAccounts)) throw new Error("Invalid account snapshot.");
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
    const result = await client.from("flow_data")
        .select("revision,data")
        .eq("user_id", userId)
        .maybeSingle();

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


async function flowSync() {
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
            if (cloud?.data?.clientSchemaVersion === 2 && flowStorage.getItem('flow_pending_client') !== '2') {
                showFlowStatus('Changes from an older Flow version need review. Open Account to download both copies and choose which to keep.');
                return;
            }
            if (cloudRevision !== localRevision) {
                showFlowStatus("Changes on two devices. Open Account to choose which copy to keep.");
                return;
            }

            const snapshot = getFlowSnapshot();
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
            replaceFlowSnapshot(cloud.data);
            flowStorage.setItem("flow_revision", String(cloudRevision));
            refreshFlowDataViews();
            showFlowStatus('All changes saved.');
            cloudReady = true;
        } else if (cloudRevision < localRevision) {
            showFlowStatus("Cloud data changed. Open Account to choose which copy to keep.");
        } else {
            showFlowStatus("All changes saved.");
            cloudReady = true;
        }

    } catch (error) {
        showFlowStatus("Could not sync. Your changes are still saved on this device.");
    } finally {
        flowSyncing = false;

        if (flowSyncAgain) {
            flowSyncAgain = false;
            setTimeout(flowSync, 0);
        }

        if (cloudReady && flowStorage.getItem('flow_user_id') === linkedUserId) {
            document.dispatchEvent(new Event("flow-cloud-ready"));
        }
    }
    return cloudReady;
}


window.addEventListener("online", flowSync);
document.addEventListener("visibilitychange", function() {
    if (!document.hidden) {
        flowSync();
    }
});
document.addEventListener("DOMContentLoaded", flowSync);

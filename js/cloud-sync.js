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
        transactions: JSON.parse(localStorage.getItem("transactions")) || [],
        budgets: JSON.parse(localStorage.getItem("budgets")) || [],
        budgetsByMonth: JSON.parse(localStorage.getItem("budgetsByMonth")) || {},
        categoryRules: JSON.parse(localStorage.getItem("categoryRules")) || [],
        recurringItems: JSON.parse(localStorage.getItem("recurringItems")) || [],
        bankAccounts: JSON.parse(localStorage.getItem("bankAccounts")) || [],
        flowPlanning: typeof loadFlowPlanning === "function" ? loadFlowPlanning() : JSON.parse(localStorage.getItem("flowPlanning") || "null")
    };
}


function replaceFlowSnapshot(data) {
    if (data.flowPlanning && typeof validFlowPlanning === "function" && !validFlowPlanning(data.flowPlanning)) throw new Error("Unsupported payday plan. Download your cloud copy before replacing data.");
    if (data.bankAccounts && typeof validBankAccounts === "function" && !validBankAccounts(data.bankAccounts)) throw new Error("Invalid account snapshot.");
    const oldData = {
        transactions: localStorage.getItem("transactions"),
        budgets: localStorage.getItem("budgets"),
        budgetsByMonth: localStorage.getItem("budgetsByMonth"),
        categoryRules: localStorage.getItem("categoryRules"),
        recurringItems: localStorage.getItem("recurringItems"),
        bankAccounts: localStorage.getItem("bankAccounts"),
        flowPlanning: localStorage.getItem("flowPlanning")
    };

    try {
        localStorage.setItem("transactions", JSON.stringify(data.transactions || []));
        localStorage.setItem("budgets", JSON.stringify(data.budgets || []));
        localStorage.setItem("budgetsByMonth", JSON.stringify(data.budgetsByMonth || {}));
        localStorage.setItem("categoryRules", JSON.stringify(data.categoryRules || []));
        localStorage.setItem("recurringItems", JSON.stringify(data.recurringItems || []));
        localStorage.setItem("bankAccounts", JSON.stringify(data.bankAccounts || []));
        if (data.flowPlanning) localStorage.setItem("flowPlanning", JSON.stringify(data.flowPlanning));
        else localStorage.removeItem("flowPlanning");
    } catch (error) {
        for (const key of Object.keys(oldData)) {
            if (oldData[key] === null) localStorage.removeItem(key);
            else localStorage.setItem(key, oldData[key]);
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
    if (!localStorage.getItem("flow_user_id")) {
        return;
    }

    localStorage.setItem("flow_pending", "1");
    showFlowStatus("Saving changes…");
    return flowSync();
}


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
    const client = getFlowClient();
    const linkedUserId = localStorage.getItem("flow_user_id");

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
        if (localStorage.getItem('flow_user_id') !== linkedUserId) return;

        const cloud = await getCloudData(client, linkedUserId);
        if (localStorage.getItem('flow_user_id') !== linkedUserId) return;
        const cloudRevision = cloud ? cloud.revision : 0;
        const localRevision = Number(localStorage.getItem("flow_revision") || 0);

        if (localStorage.getItem("flow_pending") === "1") {
            if (cloudRevision !== localRevision) {
                showFlowStatus("Changes on two devices. Open Account to choose which copy to keep.");
                return;
            }

            const snapshot = getFlowSnapshot();
            const revision = await saveCloudData(client, localRevision, snapshot);
            if (localStorage.getItem('flow_user_id') !== linkedUserId) return;
            localStorage.setItem("flow_revision", String(revision));

            if (JSON.stringify(getFlowSnapshot()) === JSON.stringify(snapshot)) {
                localStorage.removeItem("flow_pending");
                showFlowStatus("All changes saved.");
                cloudReady = true;
            } else {
                showFlowStatus("Saving new changes…");
                setTimeout(flowSync, 0);
            }

        } else if (cloudRevision > localRevision) {
            replaceFlowSnapshot(cloud.data);
            localStorage.setItem("flow_revision", String(cloudRevision));
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

        if (cloudReady && localStorage.getItem('flow_user_id') === linkedUserId) {
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

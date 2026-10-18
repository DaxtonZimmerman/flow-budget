/* keep connected banks up to date when flow is open */

let bankRefreshing = false;
const bankDisconnectingIds = new Set();


async function bankRequest(action, values = {}) {
    const result = await getFlowClient().functions.invoke("plaid", {
        body: { action: action, ...values }
    });

    if (result.error) {
        let message = result.error.message || "Could not reach your bank.";
        let needsReconnect = false;

        try {
            const details = await result.error.context?.json();

            if (typeof details?.error === "string") message = details.error;
            needsReconnect = details?.needs_reconnect === true;
        } catch (_error) {
            // use the message we already have
        }

        const error = new Error(message);
        error.needsReconnect = needsReconnect;
        throw error;
    }

    if (result.data.error) {
        const error = new Error(result.data.error);
        error.needsReconnect = result.data.needs_reconnect === true;
        throw error;
    }

    return result.data;
}


async function syncBankConnection(connectionId) {
    const result = await bankRequest("sync", { connection_id: connectionId });
    if (bankDisconnectingIds.has(connectionId)) return { ...result, changed: false };
    const current = getFlowSnapshot().transactions;
    const rules = JSON.parse(localStorage.getItem("categoryRules") || "[]");
    const merged = mergeBankSnapshot(current, connectionId, result.transactions, rules);
    const changed = JSON.stringify(current) !== JSON.stringify(merged);

    if (changed) {
        localStorage.setItem("transactions", JSON.stringify(merged));
        await flowDataChanged();
    }

    localStorage.setItem(
        `flow_bank_applied_at_${localStorage.getItem("flow_user_id")}_${connectionId}`,
        String(Date.parse(result.last_synced_at) || Date.now())
    );

    return { ...result, changed: changed };
}


async function updateBanksAutomatically() {
    const userId = localStorage.getItem("flow_user_id");

    if (bankRefreshing || !userId || !navigator.onLine ||
        localStorage.getItem("flow_pending") === "1") return;

    const checkKey = `flow_bank_checked_at_${userId}`;
    const checkedAt = Number(sessionStorage.getItem(checkKey) || 0);

    bankRefreshing = true;
    let changed = false;
    let failed = false;

    try {
        const userResult = await getFlowClient().auth.getUser();

        if (userResult.error || userResult.data.user?.id !== userId) return;

        const data = await bankRequest("connections");

        for (const connection of data.connections) {
            if (connection.needs_reconnect) {
                showFlowStatus("A bank needs attention. Open Account to reconnect it.");
                continue;
            }

            const lastSync = Date.parse(connection.last_synced_at || "") || 0;
            const appliedAt = Number(localStorage.getItem(
                `flow_bank_applied_at_${userId}_${connection.id}`
            ) || 0);

            // A webhook can update the server while this browser is open. Fetch that
            // snapshot even when the normal 15-minute Plaid poll is not due.
            if (lastSync <= appliedAt &&
                (Date.now() - lastSync < 15 * 60 * 1000 ||
                    Date.now() - checkedAt < 15 * 60 * 1000)) continue;

            try {
                const result = await syncBankConnection(connection.id);
                changed = changed || result.changed;
            } catch (error) {
                failed = true;
                showFlowStatus(error.needsReconnect
                    ? "A bank needs attention. Open Account to reconnect it."
                    : "A bank could not update. Open Account to try again.");
            }
        }

        if (!failed) {
            sessionStorage.setItem(checkKey, String(Date.now()));
        }

        document.dispatchEvent(new Event("flow-bank-updated"));

        if (changed && !document.querySelector("#transaction-form, #budget-form, #transaction-details-dialog[open]")) {
            window.location.reload();
        }
    } catch (_error) {
        showFlowStatus("A bank could not update. Open Account to try again.");
    } finally {
        bankRefreshing = false;
    }
}


document.addEventListener("flow-cloud-ready", updateBanksAutomatically);

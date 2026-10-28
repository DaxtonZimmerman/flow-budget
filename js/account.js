var flowStorage = typeof flowStorage !== 'undefined' ? flowStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
const setupPanel = document.querySelector("#account-setup");
const signInPanel = document.querySelector("#account-sign-in");
const connectedPanel = document.querySelector("#account-connected");
const retryPanel = document.querySelector("#account-retry-panel");
const deletePanel = document.querySelector("#account-delete");
const accountMessage = document.querySelector("#account-message");
const client = getFlowClient();

let accountUser;
let accountOpening = false;


async function showAccount() {
    if (accountOpening) return;
    accountOpening = true;
    retryPanel.hidden = true;
    delete document.documentElement.dataset.flowRecovering;
    try {
        if (window.FlowAuth) {
            await window.FlowAuth.ready;
            if (!window.FlowAuth.authorized) return;
        }
        if (typeof flowDemoMode !== 'undefined' && flowDemoMode) {
            setupPanel.hidden = true; connectedPanel.hidden = false;
            document.querySelector('#account-address').textContent = 'Your demo account';
            document.querySelector('#sync-now').hidden = true; document.querySelector('#sign-out').hidden = true;
            return;
        }
        if (!client) {
            setupPanel.hidden = false;
            showFlowStatus("Your work is saved here. Reconnect to sync.");
            return;
        }
        const result = await client.auth.getUser();
        accountUser = result.data.user;
        if (result.error || !accountUser) {
            signInPanel.hidden = false;
            showFlowStatus("Sign in to open Flow.");
            return;
        }
        if (window.FlowAuth && (!window.FlowAuth.authorized || window.FlowAuth.user?.id !== accountUser.id)) return;
        if (flowStorage.getItem('flow_user_id') !== accountUser.id) {
            accountMessage.textContent = 'Opening your saved account…';
            await connectFlowAccount(accountUser);
            // Reload once so every form starts with this account's saved data.
            // The sign-in return route continues automatically from here.
            window.location.reload();
            return;
        }
        connectedPanel.hidden = false;
        deletePanel.hidden = typeof flowBankRecoveryPaused !== 'undefined' && flowBankRecoveryPaused;
        document.querySelector("#account-address").textContent = accountUser.email;
        await flowSync();
        renderRecoveryCopies();
    } catch (error) {
        const recovering = error.code === 'FLOW_RECOVERY_REQUIRED';
        if (recovering) document.documentElement.dataset.flowRecovering = 'true';
        retryPanel.querySelector('h3').textContent = recovering ? 'Your saved data is protected.' : "Let's get you back in.";
        retryPanel.querySelector('p').textContent = recovering
            ? 'We could not confirm the saved account on this phone. Keep Flow installed while we finish recovery. Bank updates are paused.'
            : 'Reconnect to the internet, then try again. Your earlier work stays saved.';
        accountMessage.textContent = recovering ? '' : 'Could not open your saved account yet. Check your connection and try again.';
        document.querySelector('#account-retry').textContent = recovering ? 'Check recovery' : 'Try again';
        if (recovering) showFlowStatus('Account recovery in progress.');
        retryPanel.hidden = false;
    } finally { accountOpening = false; }
}

function renderRecoveryCopies() {
    const holder = document.querySelector('#account-recovery');
    if (!holder || !accountUser) return;
    holder.replaceChildren();
    try {
        const copies = getFlowRecoveryCopies(accountUser.id);
        holder.hidden = copies.length === 0;
        if (!copies.length) return;
        const heading = document.createElement('h3'); heading.textContent = 'Earlier changes';
        const explanation = document.createElement('p');
        explanation.textContent = 'Flow opens your saved account automatically. If changes overlap, it keeps earlier edits here so you can recover them.';
        holder.append(heading, explanation);
        for (const copy of [...copies].reverse()) {
            const row = document.createElement('div'); row.className = 'row-between';
            const when = document.createElement('span'); when.textContent = new Date(copy.savedAt).toLocaleString();
            const download = document.createElement('button'); download.type = 'button'; download.className = 'back-button';
            download.textContent = 'Download earlier changes';
            download.addEventListener('click', () => {
                if (copy.owner !== accountUser.id || flowStorage.getItem('flow_user_id') !== accountUser.id || window.FlowAuth &&
                    (!window.FlowAuth.authorized || window.FlowAuth.user?.id !== accountUser.id)) return;
                downloadFlowCopy(copy.data, 'flow-recovery-' + copy.savedAt.slice(0, 10) + '.json');
            });
            row.append(when, download); holder.append(row);
        }
    } catch (_) {
        holder.hidden = false;
        holder.textContent = 'Earlier changes are still kept here, but could not be opened. Please try again.';
    }
}
document.querySelector('#account-retry').addEventListener('click', showAccount);
document.addEventListener('flow-recovery-updated', renderRecoveryCopies);
document.addEventListener('flow-auth-ready', showAccount);
window.addEventListener('online', showAccount);


function downloadFlowCopy(data, name) {
    const backup = { version: 1, ...data, demo: typeof flowDemoMode !== 'undefined' && flowDemoMode };
    const file = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json"
    });
    const fileUrl = URL.createObjectURL(file);
    const link = document.createElement("a");

    link.href = fileUrl;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function() { URL.revokeObjectURL(fileUrl); }, 1000);
}


document.querySelector("#sync-now").addEventListener("click", flowSync);


document.querySelector('#sign-out').addEventListener('click', async () => {
    try { await window.FlowApp.signOut(); }
    catch (error) { accountMessage.textContent = error.message; }
});


document.querySelector("#delete-account").addEventListener("click", async function(event) {
    const answer = window.prompt(
        "Type DELETE to permanently remove your account and cloud data. Download a backup first if you need one."
    );

    if (answer !== "DELETE") return;

    const button = event.currentTarget;
    button.disabled = true;
    accountMessage.textContent = "Disconnecting banks and deleting your account…";

    try {
        await bankRequest("delete-account");
    } catch (error) {
        accountMessage.textContent = error.message ||
            "Could not delete your account. Try again.";
        button.disabled = false;
        return;
    }

    try {
        if (window.FlowAuth) window.FlowAuth.handlingSignOut = true;
        await client.auth.signOut();
    } catch (_error) {
        // The deleted account can no longer access cloud data.
    }
    flowStorage.removeItem(flowRecoveryKey(accountUser.id));
    for (const key of ["transactions", "budgets", "budgetsByMonth",
        "categoryRules", "recurringItems", "flowPlanning", "bankAccounts",
        "flow_user_id", "flow_revision", "flow_pending", "flowLastEstimate", "flow_pending_client", "flow_verified_user"]) {
        flowStorage.removeItem(key);
    }
    window.location.replace("login.html");
});


showAccount();

if (typeof lucide !== "undefined") {
    lucide.createIcons();
}

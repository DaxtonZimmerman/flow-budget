const setupPanel = document.querySelector("#account-setup");
const signInPanel = document.querySelector("#account-sign-in");
const connectedPanel = document.querySelector("#account-connected");
const choosePanel = document.querySelector("#account-choose");
const deletePanel = document.querySelector("#account-delete");
const accountMessage = document.querySelector("#account-message");
const client = getFlowClient();

let accountUser;
let previewRevision = 0;


function countFlowData(data) {
    const months = Object.keys(data.budgetsByMonth || {});
    let budgetCount = (data.budgets || []).length;

    for (const month of months) {
        budgetCount += data.budgetsByMonth[month].length;
    }

    return `${data.transactions.length} transactions, ${budgetCount} budgets, ` +
        `${(data.categoryRules || []).length} category rules, and ` +
        `${(data.recurringItems || []).length} monthly decisions`;
}


async function showAccount() {
    if (!client) {
        setupPanel.hidden = false;
        if (flowCloudUrl && flowCloudKey) {
            setupPanel.querySelector("p:last-child").textContent =
                "Could not load the sign-in library. Check your connection and reload.";
        }
        showFlowStatus("Flow is saved on this device.");
        return;
    }

    try {
        const result = await client.auth.getUser();
        accountUser = result.data.user;

        if (result.error || !accountUser) {
            signInPanel.hidden = false;
            showFlowStatus("Sign in to connect devices.");
            return;
        }

        connectedPanel.hidden = false;
        deletePanel.hidden = false;
        document.querySelector("#account-address").textContent = accountUser.email;

        const cloud = await getCloudData(client, accountUser.id);
        previewRevision = cloud ? cloud.revision : 0;
        const linkedUser = localStorage.getItem("flow_user_id");
        const localRevision = Number(localStorage.getItem("flow_revision") || 0);
        const hasConflict = linkedUser === accountUser.id &&
            previewRevision !== localRevision &&
            (localStorage.getItem("flow_pending") === "1" ||
                previewRevision < localRevision);

        if (linkedUser !== accountUser.id || hasConflict) {
            const localCount = countFlowData(getFlowSnapshot());
            const cloudCount = cloud
                ? countFlowData(cloud.data)
                : "no saved data";

            document.querySelector("#copy-preview").textContent =
                `This device has ${localCount}. Your cloud account has ${cloudCount}.`;
            choosePanel.hidden = false;
            showFlowStatus(hasConflict
                ? "Both devices have new changes. Choose which copy to keep."
                : "Choose which data to use with this account.");
        } else {
            flowSync();
        }
    } catch (error) {
        accountMessage.textContent =
            "Could not reach your account. Check your connection and try again.";
    }
}


document.querySelector("#sign-in-form").addEventListener("submit", async function(event) {
    event.preventDefault();
    accountMessage.textContent = "Sending your link…";

    const email = document.querySelector("#account-email").value.trim();
    const redirect = new URL("account.html", window.location.href).href;
    try {
        const result = await client.auth.signInWithOtp({
            email: email,
            options: { emailRedirectTo: redirect }
        });

        accountMessage.textContent = result.error
            ? result.error.message
            : "Check your email for a sign-in link.";
    } catch (error) {
        accountMessage.textContent = "Could not send the link. Try again online.";
    }
});


document.querySelector("#use-device").addEventListener("click", async function() {
    if (!accountUser) return;

    if (previewRevision > 0 && !window.confirm(
        "Replace your cloud data with this device's data? Download a backup first if you need both copies."
    )) {
        return;
    }

    accountMessage.textContent = "Saving this device’s data…";

    try {
        const revision = await saveCloudData(client, previewRevision, getFlowSnapshot());
        localStorage.setItem("flow_user_id", accountUser.id);
        localStorage.setItem("flow_revision", String(revision));
        localStorage.removeItem("flow_pending");
        window.location.reload();
    } catch (error) {
        accountMessage.textContent =
            "Cloud data changed or could not be saved. Reload to review both copies again.";
    }
});


document.querySelector("#use-cloud").addEventListener("click", async function() {
    if (!accountUser) return;

    if (!window.confirm(
        "Replace this device's data with your cloud data? Download a device backup first if you need it."
    )) {
        return;
    }

    try {
        const cloud = await getCloudData(client, accountUser.id);

        if ((cloud ? cloud.revision : 0) !== previewRevision) {
            accountMessage.textContent =
                "Cloud data changed. Reload to review the latest copy first.";
            return;
        }

        replaceFlowSnapshot(cloud ? cloud.data : {
            transactions: [], budgets: [], budgetsByMonth: {}
        });
        localStorage.setItem("flow_user_id", accountUser.id);
        localStorage.setItem("flow_revision", String(previewRevision));
        localStorage.removeItem("flow_pending");
        window.location.reload();
    } catch (error) {
        accountMessage.textContent = "Could not load cloud data. Try again.";
    }
});


function downloadFlowCopy(data, name) {
    const backup = { version: 1, ...data };
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


document.querySelector("#download-local").addEventListener("click", function() {
    downloadFlowCopy(getFlowSnapshot(), "flow-device-backup.json");
});


document.querySelector("#download-cloud").addEventListener("click", async function() {
    if (!accountUser) return;

    try {
        const cloud = await getCloudData(client, accountUser.id);

        if (!cloud) {
            accountMessage.textContent = "No cloud data to download yet.";
            return;
        }

        downloadFlowCopy(cloud.data, "flow-cloud-backup.json");
    } catch (error) {
        accountMessage.textContent = "Could not download cloud data. Try again.";
    }
});


document.querySelector("#sync-now").addEventListener("click", flowSync);


document.querySelector("#sign-out").addEventListener("click", async function() {
    if (localStorage.getItem("flow_pending") === "1") {
        accountMessage.textContent =
            "This device has unsynced changes. Sync or download a backup first.";
        return;
    }

    let result;

    try {
        result = await client.auth.signOut();
    } catch (error) {
        accountMessage.textContent = "Could not sign out. Try again online.";
        return;
    }

    if (result.error) {
        accountMessage.textContent = result.error.message;
        return;
    }

    if (localStorage.getItem("flow_user_id") === accountUser.id) {
        localStorage.removeItem("transactions");
        localStorage.removeItem("budgets");
        localStorage.removeItem("budgetsByMonth");
        localStorage.removeItem("categoryRules");
        localStorage.removeItem("recurringItems");
        localStorage.removeItem("flow_user_id");
        localStorage.removeItem("flow_revision");
    }

    window.location.reload();
});


document.querySelector("#delete-account").addEventListener("click", async function() {
    const answer = window.prompt(
        "Type DELETE to permanently remove your account and cloud data. Download a backup first if you need one."
    );

    if (answer !== "DELETE") return;

    const result = await client.rpc("delete_flow_account");

    if (result.error) {
        accountMessage.textContent = "Could not delete your account. Try again.";
        return;
    }

    await client.auth.signOut();
    for (const key of ["transactions", "budgets", "budgetsByMonth",
        "categoryRules", "recurringItems",
        "flow_user_id", "flow_revision", "flow_pending"]) {
        localStorage.removeItem(key);
    }
    window.location.href = "index.html";
});


showAccount();

if (typeof lucide !== "undefined") {
    lucide.createIcons();
}

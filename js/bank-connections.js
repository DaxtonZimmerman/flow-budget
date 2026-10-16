const bankPanel = document.querySelector("#bank-connections");
const bankButton = document.querySelector("#connect-bank");
const bankMessage = document.querySelector("#bank-message");
const bankList = document.querySelector("#connected-banks");


async function bankRequest(action, values = {}) {
    const result = await getFlowClient().functions.invoke("plaid", {
        body: { action: action, ...values }
    });

    if (result.error) {
        let message = result.error.message ||
            "Bank connection is not ready. Check the server setup.";

        if (result.error.context?.status) {
            message += ` (HTTP ${result.error.context.status})`;
        }

        try {
            const details = await result.error.context?.json();

            if (typeof details?.error === "string") {
                message = details.error;
            }
        } catch (_error) {
            // use the general message if the server did not send one
        }

        throw new Error(message);
    }

    if (result.data.error) {
        throw new Error(result.data.error);
    }

    return result.data;
}


async function showBankConnections() {
    const client = getFlowClient();

    if (!client) return;

    const result = await client.auth.getUser();

    if (result.error || !result.data.user ||
        localStorage.getItem("flow_user_id") !== result.data.user.id) return;

    bankPanel.hidden = false;

    try {
        const data = await bankRequest("connections");
        bankList.replaceChildren();

        for (const connection of data.connections) {
            const item = document.createElement("li");
            const details = document.createElement("div");
            const name = document.createElement("strong");
            const updated = document.createElement("small");
            const syncButton = document.createElement("button");
            const removeButton = document.createElement("button");
            const actions = document.createElement("div");

            name.textContent = connection.institution_name;
            updated.textContent = connection.last_synced_at
                ? `Updated ${new Date(connection.last_synced_at).toLocaleString()}`
                : "Not synced yet";
            syncButton.type = "button";
            syncButton.className = "back-button";
            syncButton.textContent = "Sync";
            removeButton.type = "button";
            removeButton.className = "delete-transaction-button";
            removeButton.textContent = "Disconnect";

            syncButton.addEventListener("click", async function() {
                syncButton.disabled = true;
                bankMessage.textContent = `Syncing ${connection.institution_name}…`;

                try {
                    const result = await bankRequest("sync", {
                        connection_id: connection.id
                    });
                    const current = getFlowSnapshot().transactions;
                    const merged = mergeBankSnapshot(
                        current, connection.id, result.transactions
                    );

                    if (JSON.stringify(current) !== JSON.stringify(merged)) {
                        localStorage.setItem("transactions", JSON.stringify(merged));
                        flowDataChanged();
                    }

                    updated.textContent = `Updated ${new Date(result.last_synced_at).toLocaleString()}`;
                    bankMessage.textContent = `${connection.institution_name} is up to date.`;
                } catch (error) {
                    bankMessage.textContent = error.message;
                } finally {
                    syncButton.disabled = false;
                }
            });

            removeButton.addEventListener("click", async function() {
                if (!window.confirm(
                    `Disconnect ${connection.institution_name} and remove its transactions from Flow?`
                )) return;

                removeButton.disabled = true;
                bankMessage.textContent = `Disconnecting ${connection.institution_name}…`;

                try {
                    await bankRequest("disconnect", { connection_id: connection.id });
                    const current = getFlowSnapshot().transactions;
                    const remaining = current.filter(function(transaction) {
                        return transaction.bankConnectionId !== connection.id;
                    });

                    localStorage.setItem("transactions", JSON.stringify(remaining));
                    flowDataChanged();
                    item.remove();
                    bankMessage.textContent = `${connection.institution_name} disconnected.`;
                } catch (error) {
                    bankMessage.textContent = error.message;
                    removeButton.disabled = false;
                }
            });

            details.appendChild(name);
            details.appendChild(updated);
            actions.className = "bank-actions";
            actions.appendChild(syncButton);
            actions.appendChild(removeButton);
            item.appendChild(details);
            item.appendChild(actions);
            bankList.appendChild(item);
        }
    } catch (error) {
        bankMessage.textContent = error.message;
    }
}


bankButton.addEventListener("click", async function() {
    bankButton.disabled = true;
    bankMessage.textContent = "Opening the test bank…";

    try {
        if (typeof Plaid === "undefined") {
            throw new Error("Could not load Plaid. Check your connection and reload.");
        }

        const data = await bankRequest("create-link-token");
        const link = Plaid.create({
            token: data.link_token,
            onSuccess: async function(publicToken, metadata) {
                bankMessage.textContent = "Saving your test bank…";

                try {
                    await bankRequest("exchange-public-token", {
                        public_token: publicToken,
                        institution_name: metadata?.institution?.name || "Bank"
                    });
                    bankMessage.textContent = "Test bank connected. Transaction sync is next.";
                    await showBankConnections();
                } catch (error) {
                    bankMessage.textContent = error.message;
                }

                bankButton.disabled = false;
            },
            onExit: function() {
                bankButton.disabled = false;
                bankMessage.textContent = "Bank connection closed.";
            }
        });

        link.open();
    } catch (error) {
        bankMessage.textContent = error.message;
        bankButton.disabled = false;
    }
});


showBankConnections();

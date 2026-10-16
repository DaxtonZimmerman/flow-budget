const bankPanel = document.querySelector("#bank-connections");
const bankButton = document.querySelector("#connect-bank");
const bankMessage = document.querySelector("#bank-message");
const bankList = document.querySelector("#connected-banks");


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
            updated.textContent = connection.needs_reconnect
                ? "Needs to be reconnected"
                : connection.last_synced_at
                    ? `Updated ${new Date(connection.last_synced_at).toLocaleString()}`
                    : "Not synced yet";
            if (connection.needs_reconnect) updated.className = "bank-warning";
            syncButton.type = "button";
            syncButton.className = "back-button";
            syncButton.textContent = "Sync";
            syncButton.disabled = connection.needs_reconnect;
            removeButton.type = "button";
            removeButton.className = "delete-transaction-button";
            removeButton.textContent = "Disconnect";

            syncButton.addEventListener("click", async function() {
                syncButton.disabled = true;
                bankMessage.textContent = `Syncing ${connection.institution_name}…`;

                try {
                    const update = await syncBankConnection(connection.id);
                    sessionStorage.setItem(
                        `flow_bank_checked_at_${localStorage.getItem("flow_user_id")}`,
                        String(Date.now())
                    );
                    updated.textContent = `Updated ${new Date(update.last_synced_at).toLocaleString()}`;
                    bankMessage.textContent = `${connection.institution_name} is up to date.`;
                } catch (error) {
                    bankMessage.textContent = error.message;
                    if (error.needsReconnect) await showBankConnections();
                } finally {
                    syncButton.disabled = false;
                }
            });

            if (connection.needs_reconnect) {
                const reconnectButton = document.createElement("button");
                reconnectButton.type = "button";
                reconnectButton.className = "save-button";
                reconnectButton.textContent = "Reconnect";

                reconnectButton.addEventListener("click", async function() {
                    reconnectButton.disabled = true;
                    bankMessage.textContent = `Opening ${connection.institution_name}…`;

                    try {
                        if (typeof Plaid === "undefined") {
                            throw new Error("Could not load Plaid. Reload and try again.");
                        }

                        const data = await bankRequest("reconnect", {
                            connection_id: connection.id
                        });
                        const link = Plaid.create({
                            token: data.link_token,
                            onSuccess: async function() {
                                bankMessage.textContent = "Checking your bank connection…";

                                try {
                                    await syncBankConnection(connection.id);
                                    bankMessage.textContent =
                                        `${connection.institution_name} is reconnected.`;
                                    await showBankConnections();
                                } catch (error) {
                                    bankMessage.textContent = error.message;
                                    reconnectButton.disabled = false;
                                }
                            },
                            onExit: function() {
                                reconnectButton.disabled = false;
                                bankMessage.textContent = "Bank reconnection closed.";
                            }
                        });

                        link.open();
                    } catch (error) {
                        bankMessage.textContent = error.message;
                        reconnectButton.disabled = false;
                    }
                });

                actions.appendChild(reconnectButton);
            }

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
                    await flowDataChanged();
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
                    bankMessage.textContent = "Test bank connected. Checking transactions…";
                    await showBankConnections();
                    sessionStorage.removeItem(
                        `flow_bank_checked_at_${localStorage.getItem("flow_user_id")}`
                    );
                    await updateBanksAutomatically();
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


document.addEventListener("flow-bank-updated", showBankConnections);
showBankConnections();

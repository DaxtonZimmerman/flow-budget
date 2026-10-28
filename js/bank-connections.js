var flowStorage = typeof flowStorage !== 'undefined' ? flowStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
const bankPanel = document.querySelector("#bank-connections");
const bankButton = document.querySelector("#connect-bank");
const bankIntro = document.querySelector("#bank-intro");
const bankMessage = document.querySelector("#bank-message");
const bankList = document.querySelector("#connected-banks");


async function showBankConnections() {
    const client = getFlowClient();

    if (!client) return;

    const result = await client.auth.getUser();

    if (result.error || !result.data.user ||
        flowStorage.getItem("flow_user_id") !== result.data.user.id) return;

    bankPanel.hidden = false;

    if (typeof flowBankRecoveryPaused !== 'undefined' && flowBankRecoveryPaused) {
        bankButton.hidden = true;
        bankIntro.textContent = 'Bank updates are paused while we restore the saved connection. You do not need to reconnect your bank.';
        bankMessage.textContent = 'Your budgeting changes can still save normally.';
        bankList.replaceChildren();
        return;
    }

    try {
        const data = await bankRequest("connections");
        const productionPilot = data.new_connection_environment === "production";
        const realBankConnected = productionPilot && data.connections.some(
            connection => connection.environment === "production"
        );
        const testBankConnected = productionPilot && data.connections.some(
            connection => connection.environment === "sandbox"
        );
        bankButton.hidden = data.recovery_mode && (!productionPilot || realBankConnected);
        bankButton.textContent = data.recovery_mode && productionPilot ? "Restore bank updates" : productionPilot ? "Connect my bank" : "Connect test bank";
        bankButton.disabled = realBankConnected || testBankConnected;
        bankIntro.textContent = data.connections.some(c=>c.recovery_required)
            ? "Your new connection is saved. Review the accounts and replacement history below before starting automatic updates. Your original connection stays untouched."
            : data.recovery_mode && productionPilot && !realBankConnected
            ? "Restore Mountain America updates with one new connection. This uses another lifetime Trial slot. Flow will preview the new history before replacing the old feed and keep a recovery copy. Your original connection stays untouched."
            : productionPilot
            ? "Connect your own bank through Plaid. Flow will import the accounts and transactions you choose. Your bank data is saved privately in Flow and on this device for offline use. Back up and disconnect any test bank first. Flow checks for available updates while open and when you return. Your bank may report new activity later. This private pilot supports one real bank at a time. Each new connection uses one of the Trial's 10 lifetime slots, even if you later disconnect it."
            : "Connect a test bank in Plaid Sandbox. Flow checks for available updates while open and when you return; you can also check here anytime. Reconnect a bank here if it needs attention. Disconnecting removes its synced transactions.";
        bankList.replaceChildren();

        for (const connection of data.connections) {
            if (connection.recovery_required) {
                const row = document.createElement('li'), name = document.createElement('strong'), finish = document.createElement('button');
                name.textContent = `${connection.institution_name} · finish recovery review`;
                finish.type='button';finish.className='save-button';finish.textContent='Review bank recovery';
                finish.addEventListener('click',()=>window.FlowBankRecovery.open(connection));row.append(name,finish);bankList.append(row);
                continue;
            }
            const item = document.createElement("li");
            const details = document.createElement("div");
            const name = document.createElement("strong");
            const updated = document.createElement("small");
            const syncButton = document.createElement("button");
            const removeButton = document.createElement("button");
            const actions = document.createElement("div");

            name.textContent = connection.environment === "sandbox"
                ? `${connection.institution_name} (test)` : connection.institution_name;
            const feed=loadBankFeedStatus().find(row=>row.id===connection.id);
            updated.textContent=feed?bankFeedState(feed).title:connection.needs_reconnect?'Reconnect needed':'Bank feed timing unavailable';
            const feedDetails=document.createElement('button');feedDetails.type='button';feedDetails.className='inline-link bank-feed-account-link';feedDetails.textContent='Update details';feedDetails.setAttribute('data-bank-feed-open','');
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
                        `flow_bank_checked_at_${flowStorage.getItem("flow_user_id")}`,
                        String(Date.now())
                    );
                    const currentFeed=loadBankFeedStatus().find(row=>row.id===connection.id);
                    updated.textContent=currentFeed?bankFeedState(currentFeed).title:'Bank feed timing unavailable';
                    bankMessage.textContent = `Checked ${connection.institution_name}. New activity can arrive later from your bank.`;
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
                                    await bankRequest("reconnect-complete", {
                                        connection_id: connection.id
                                    });
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

                if (flowStorage.getItem("flow_pending") === "1" ||
                    flowSyncing || bankRefreshing) {
                    bankMessage.textContent = "Wait for your current changes to finish saving, then disconnect.";
                    return;
                }

                removeButton.disabled = true;
                bankMessage.textContent = `Disconnecting ${connection.institution_name}…`;
                bankDisconnectingIds.add(connection.id);

                try {
                    const result = await bankRequest("disconnect", { connection_id: connection.id });
                    if (result.data) replaceFlowSnapshot(result.data);
                    else {
                        const current = getFlowSnapshot().transactions;
                        flowStorage.setItem("transactions", JSON.stringify(current.filter(
                            transaction => transaction.bankConnectionId !== connection.id
                        )));
                    }
                    flowStorage.setItem("flow_revision", String(result.revision));
                    flowStorage.removeItem("flow_pending");
                    flowStorage.removeItem(
                        `flow_bank_applied_at_${flowStorage.getItem("flow_user_id")}_${connection.id}`
                    );
                    forgetBankFeedConnection(connection.id,flowStorage.getItem('flow_user_id'));
                    const accounts = JSON.parse(flowStorage.getItem("bankAccounts") || "[]");
                    flowStorage.setItem("bankAccounts", JSON.stringify(accounts.filter(a => a.bankConnectionId !== connection.id)));
                    await flowDataChanged();
                    document.dispatchEvent(new Event("flow-accounts-updated"));
                    item.remove();
                    bankMessage.textContent = `${connection.institution_name} disconnected.`;
                    await showBankConnections();
                } catch (error) {
                    bankMessage.textContent = error.message;
                    removeButton.disabled = false;
                } finally {
                    bankDisconnectingIds.delete(connection.id);
                }
            });

            details.appendChild(name);
            details.appendChild(updated);
            details.appendChild(feedDetails);
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
    bankMessage.textContent = "Opening Plaid…";

    try {
        if (typeof Plaid === "undefined") {
            throw new Error("Could not load Plaid. Check your connection and reload.");
        }

        if (await flowSync() !== true || flowStorage.getItem('flow_pending') === '1') throw new Error('Wait for your saved changes before connecting.');
        keepFlowRecoveryCopy(flowStorage.getItem('flow_user_id'),getFlowSnapshot(),'before-bank-connection');
        const data = await bankRequest("create-link-token");
        const link = Plaid.create({
            token: data.link_token,
            onSuccess: async function(publicToken, metadata) {
                bankMessage.textContent = "Saving your bank connection…";

                try {
                    const exchanged = await bankRequest("exchange-public-token", {
                        public_token: publicToken,
                        institution_name: metadata?.institution?.name || "Bank"
                    });
                    if (exchanged.recovery_required) {
                        bankMessage.textContent = 'Bank connected. Choose Review bank recovery to finish safely.';
                        await showBankConnections();
                        return;
                    }
                    bankMessage.textContent = "Bank connected. Checking transactions…";
                    await showBankConnections();
                    sessionStorage.removeItem(
                        `flow_bank_checked_at_${flowStorage.getItem("flow_user_id")}`
                    );
                    await updateBanksAutomatically();
                } catch (error) {
                    bankMessage.textContent = error.message;
                    bankButton.disabled = false;
                }
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

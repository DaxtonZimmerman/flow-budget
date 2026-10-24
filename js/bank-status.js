/* Transaction-feed timing only. These dates never establish a balance date. */
function bankFeedTime(value, now = Date.now()) {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value)) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) && time > 0 && time <= now + 300000 ? new Date(time).toISOString() : null;
}
function bankFeedDate(value, now = Date.now()) {
    const safe = bankFeedTime(value, now);
    if (!safe) return 'Not supplied';
    const day = new Date(safe), current = new Date(now), yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const prefix = day.toDateString() === current.toDateString() ? 'Today' : day.toDateString() === yesterday.toDateString() ? 'Yesterday' : day.toLocaleDateString('en-US', { month:'short', day:'numeric', ...(day.getFullYear() !== current.getFullYear() ? {year:'numeric'} : {}) });
    return prefix + ', ' + day.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
}
function bankFeedState(row, now = Date.now()) {
    const bankAt = bankFeedTime(row.bankCheckedAt, now), failedAt = bankFeedTime(row.lastFailedAt, now);
    if (row.needsReconnect) return {kind:'reconnect', title:'Reconnect needed', bankAt};
    if (failedAt && (!bankAt || failedAt > bankAt)) return {kind:'retrying', title:'Bank update delayed', bankAt};
    if (!bankAt) return {kind:'unknown', title:'Bank feed timing unavailable', bankAt:null};
    if (now - Date.parse(bankAt) > 24 * 3600000) return {kind:'waiting', title:'Waiting for a bank update', bankAt};
    return {kind:'connected', title:'Bank feed checked ' + bankFeedDate(bankAt, now), bankAt};
}
function loadBankFeedStatus(owner = flowStorage.getItem('flow_user_id')) {
    if (!owner || flowStorage.getItem('flow_user_id') !== owner) return [];
    try {
        const saved = JSON.parse(flowStorage.getItem('flow_bank_feed:' + owner) || 'null');
        return saved?.owner === owner && Array.isArray(saved.rows) ? saved.rows.filter(row => row && typeof row.id === 'string' && typeof row.name === 'string') : [];
    } catch (_) { return []; }
}
function writeBankFeedStatus(owner, rows, startedAt = Date.now()) {
    if (!owner || flowStorage.getItem('flow_user_id') !== owner) return false;
    try {
        const key = 'flow_bank_feed:' + owner, previous = JSON.parse(flowStorage.getItem(key) || 'null');
        if (previous?.startedAt > startedAt) return false;
        flowStorage.setItem(key, JSON.stringify({owner, startedAt, rows}));
        document.dispatchEvent(new Event('flow-bank-status-updated'));
        return true;
    } catch (_) { return false; } // A status cache must never stop a transaction import.
}
function rememberBankFeedConnections(connections, owner, startedAt = Date.now()) {
    if (!Array.isArray(connections) || !owner || flowStorage.getItem('flow_user_id') !== owner) return;
    const previous = loadBankFeedStatus(owner), now = Date.now(), checkedAt = new Date(now).toISOString();
    const latest=(...values)=>values.map(v=>bankFeedTime(v,now)).filter(Boolean).sort().pop()||null;
    const rows = connections.filter(c => typeof c?.id === 'string' && !(typeof bankDisconnectingIds !== 'undefined' && bankDisconnectingIds.has(c.id))).map(c => {
        const old = previous.find(row => row.id === c.id);
        const status = c.transaction_status || {};
        return { id:c.id, name:String(c.institution_name || 'Connected bank').slice(0,200),
            bankCheckedAt:latest(status.last_successful_update,old?.bankCheckedAt),
            lastFailedAt:latest(status.last_failed_update,old?.lastFailedAt),
            appliedBankCheckedAt:bankFeedTime(old?.appliedBankCheckedAt, now),
            flowCheckedAt:checkedAt, needsReconnect:c.needs_reconnect === true };
    });
    writeBankFeedStatus(owner, rows, startedAt);
}
function markBankFeedApplied(connectionId, status, owner) {
    const now = Date.now(), rows = loadBankFeedStatus(owner), row = rows.find(r => r.id === connectionId);
    if (!row || typeof bankDisconnectingIds !== 'undefined' && bankDisconnectingIds.has(connectionId)) return;
    const at = bankFeedTime(status?.last_successful_update, now);
    // Only the successful import can advance this device's feed watermark.
    if (at && (!row.appliedBankCheckedAt || at > row.appliedBankCheckedAt)) row.appliedBankCheckedAt = at;
    if (at && (!row.bankCheckedAt || at > row.bankCheckedAt)) row.bankCheckedAt = at;
    const failed = bankFeedTime(status?.last_failed_update, now);
    if (failed && (!row.lastFailedAt || failed > row.lastFailedAt)) row.lastFailedAt = failed;
    row.flowCheckedAt = new Date(now).toISOString();
    writeBankFeedStatus(owner, rows);
}
function bankFeedNeedsImport(connectionId, owner) {
    const row = loadBankFeedStatus(owner).find(r => r.id === connectionId);
    const at = bankFeedTime(row?.bankCheckedAt);
    return Boolean(at && (!bankFeedTime(row.appliedBankCheckedAt) || at > row.appliedBankCheckedAt));
}
function forgetBankFeedConnection(connectionId, owner) {
    writeBankFeedStatus(owner, loadBankFeedStatus(owner).filter(row => row.id !== connectionId));
}
function bankFeedSummary(rows, phase = '') {
    if (phase === 'checking') return {kind:'checking', title:'Checking for bank updates…'};
    if (phase === 'error') return {kind:'retrying', title:'Couldn’t check · retrying automatically'};
    if (phase === 'offline') return {kind:'offline', title:'Offline · updates will resume'};
    if (phase === 'reconnect') return {kind:'reconnect', title:'Reconnect your bank'};
    if (phase === 'waiting') return {kind:'waiting', title:'Bank checks resume after saving'};
    if (phase === 'signin') return {kind:'reconnect', title:'Sign in to resume bank updates'};
    const states = rows.map(row => bankFeedState(row));
    for (const kind of ['reconnect','retrying','waiting','unknown']) if (states.some(s => s.kind === kind)) return states.find(s => s.kind === kind);
    const oldest = states.map(s => s.bankAt).filter(Boolean).sort()[0];
    return oldest ? {kind:'connected', title:'Bank feed checked ' + bankFeedDate(oldest)} : {kind:'unknown', title:'Bank feed timing unavailable'};
}

if (typeof module !== 'undefined' && module.exports) module.exports = {bankFeedTime,bankFeedDate,bankFeedState,bankFeedSummary};

if (typeof document !== 'undefined' && typeof window !== 'undefined') (function () {
    let dialog, invoker, dialogOwner;
    const node = (tag, cls, text) => { const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n; };
    const close = () => { if(dialog?.open)dialog.close(); };
    function render() {
        if (!dialog?.open) return;
        if (dialogOwner !== flowStorage.getItem('flow_user_id')) { close(); return; }
        const rows=loadBankFeedStatus(dialogOwner), phase=typeof bankSyncState !== 'undefined'?bankSyncState.phase:'', summary=bankFeedSummary(rows,phase);
        const oldHelp=dialog.querySelector('.setup-extra'),helpWasOpen=oldHelp?.open,previousScroll=dialog.scrollTop;
        const content=node('div','bank-feed-content'), hero=node('section','bank-feed-hero');hero.dataset.kind=summary.kind;
        const bankAt=rows.map(r=>bankFeedTime(r.bankCheckedAt)).filter(Boolean).sort()[0];
        hero.append(node('span','small-label',summary.kind==='connected'?'Last bank feed check':'Automatic updates'),node('h3','',summary.kind==='connected'?bankFeedDate(bankAt):summary.title),node('p','',summary.kind==='unknown'?'We’ll show a bank-side time when it’s supplied.':'Newer payments can arrive later than they appear in your banking app.'));
        content.append(hero);
        for (const row of rows) {
            const state=bankFeedState(row), card=node('section','bank-feed-bank'), dl=node('dl');
            card.append(node('strong','',row.name));
            for (const [label,value] of [['Bank feed checked',row.bankCheckedAt],['Flow checked',row.flowCheckedAt]]) {
                const pair=node('div');pair.append(node('dt','',label),node('dd','',bankFeedDate(value)));dl.append(pair);
            }
            card.append(dl);
            if (state.kind==='reconnect') { const a=node('a','inline-link','Reconnect bank');a.href='account.html#bank-connections';card.append(a); }
            else if (state.kind==='retrying') card.append(node('p','bank-feed-note','The bank feed’s latest attempt failed. It will retry automatically.'));
            content.append(card);
        }
        const help=node('details','setup-extra');help.open=Boolean(helpWasOpen);help.append(node('summary','','About these times'),node('p','','“Bank feed checked” is Plaid’s last successful connection to your bank for transactions, even if no new payments were found. “Flow checked” is when this device asked for available data. Neither is a live balance date.'),node('p','','Some banks don’t share pending holds. Flow displays them when supplied and updates them when they post.'));
        content.append(help);
        const footer=node('div','bank-feed-actions'), check=node('button','back-button','Check available updates');check.type='button';check.disabled=phase==='checking';
        check.addEventListener('click',async()=>{check.disabled=true;check.textContent='Checking…';try{await checkBanksOnReturn(true);}catch(_){/* The existing automatic retry remains active. */}finally{if(dialog?.open&&dialogOwner===flowStorage.getItem('flow_user_id')){render();if(document.activeElement===document.body||document.activeElement===dialog)dialog.querySelector('.bank-feed-actions button')?.focus({preventScroll:true});}}});
        footer.append(node('span','','Checks run automatically'),check);content.append(footer);
        const active=document.activeElement,helpFocus=oldHelp?.contains(active),checkFocus=active?.closest('.bank-feed-actions');
        dialog.querySelector('.bank-feed-content')?.remove();dialog.append(content);dialog.scrollTop=previousScroll;
        if(helpFocus)help.querySelector('summary').focus({preventScroll:true});else if(checkFocus&&!check.disabled)check.focus({preventScroll:true});
    }
    function open(target) {
        const owner=flowStorage.getItem('flow_user_id');if(!owner)return;
        if(!dialog){
            dialog=node('dialog','transaction-details-dialog bank-feed-dialog');dialog.setAttribute('aria-labelledby','bank-feed-title');
            const head=node('div','dialog-head'),title=node('h2','','Bank updates'),button=node('button','icon-button','×');title.id='bank-feed-title';button.type='button';button.setAttribute('aria-label','Close bank updates');button.addEventListener('click',close);head.append(title,button);dialog.append(head);document.body.append(dialog);
            dialog.addEventListener('close',()=>{dialog.querySelector('.bank-feed-content')?.remove();if(dialogOwner!==flowStorage.getItem('flow_user_id'))return;const targets=[invoker,...document.querySelectorAll('#payday-dialog[open] [data-bank-feed-open]'),...document.querySelectorAll('[data-bank-feed-open]')];const target=targets.find(n=>n?.isConnected&&n.getClientRects().length&&!n.closest('[inert]'));target?.focus({preventScroll:true});});
            dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
        }
        invoker=target;dialogOwner=owner;if(!dialog.open)dialog.showModal();render();dialog.querySelector('.icon-button').focus({preventScroll:true});
    }
    window.FlowBankFeed={open,render};
    document.addEventListener('click',event=>{const target=event.target.closest('[data-bank-feed-open]');if(target)open(target);});
    document.addEventListener('flow-bank-status-updated',render);
    document.addEventListener('flow-cloud-ready',render);
    window.addEventListener('storage',event=>{if(event.key==='flow_user_id'||event.key==='flow_bank_feed:'+dialogOwner)render();});
})();

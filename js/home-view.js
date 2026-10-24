/* Presentation choices only. The payday engine remains the source of money amounts. */
function flowHomeSourceStatus(planning, accounts, today, now = Date.now()) {
    if (planning.manualBalance) {
        const current = planning.manualBalance.date === today;
        return { kind: current ? 'confirmed' : 'check', label: current ? 'Money confirmed today' : 'Manual balance needs a check', caution: !current };
    }
    const ids = planning.selectedAccountIds || [], selected = accounts.filter(a => ids.includes(a.id));
    if (!selected.length || selected.length !== ids.length) return { kind: 'check', label: 'Choose your spending money', caution: true };
    // Retrieval time describes Flow's check, never the bank's balance date.
    const retrieved = selected.map(a => Date.parse(a.retrievedAt || ''));
    if (retrieved.some(t => !Number.isFinite(t) || now - t > 36 * 3600000 || t > now + 300000)) {
        return { kind: 'check', label: 'Waiting for a bank update', caution: true };
    }
    const timestamps = selected.map(a => Date.parse(a.bankUpdatedAt || ''));
    if (selected.some((a, i) => a.bankUpdatedAt && (!Number.isFinite(timestamps[i]) || now - timestamps[i] > 36 * 3600000 || timestamps[i] > now + 300000))) {
        return { kind: 'check', label: 'Check the bank balance date', caution: true };
    }
    // Plaid normally omits the bank timestamp. An otherwise valid snapshot needs no manual fix.
    if (timestamps.some(t => !Number.isFinite(t))) {
        const checked = new Date(Math.min(...retrieved));
        const checkedDate = checked.getFullYear() + '-' + String(checked.getMonth() + 1).padStart(2, '0') + '-' + String(checked.getDate()).padStart(2, '0');
        const when = checked.toLocaleString('en-US', checkedDate === today ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' });
        return { kind: 'unknown', label: 'Bank estimate · checked ' + when, caution: false };
    }
    const oldest = new Date(Math.min(...timestamps)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { kind: 'bank', label: 'Bank balance dated ' + oldest, caution: false };
}
function flowHomeTasks(planning, estimate, tracking, reviewCount, reminders, checkInDue) {
    const tasks = [];
    if (!planning.setup.completed) tasks.push({ key: 'setup', title: 'Set up your payday plan', text: 'Choose spending money, payday, and what to keep aside.', href: 'setup.html', icon: 'sprout' });
    else if (checkInDue) tasks.push({ key: 'payday', title: 'Start your next payday plan', text: 'Confirm what arrived and what to keep aside.', action: 'payday-checkin', icon: 'sunrise' });
    else if (!estimate.ready) tasks.push({ key: 'check', title: 'Check your money and plan', text: estimate.missing[0] || 'A planning choice needs confirmation.', tool: 'reconcile', icon: 'circle-help' });
    else if (estimate.leftCents < 0) tasks.push({ key: 'shortfall', title: 'Adjust your plan', text: 'Your bills and set-asides exceed available money.', href: 'budgets.html', icon: 'triangle-alert' });
    if (tracking.alerts?.length) tasks.push({ key: 'bills', title: tracking.alerts.length + ' bill' + (tracking.alerts.length === 1 ? ' needs' : 's need') + ' a check', text: 'Check a payment, changed amount, or due date.', href: 'bills.html#bill-tracking', icon: 'receipt' });
    else if (tracking.suggestions?.length) tasks.push({ key: 'suggestions', title: tracking.suggestions.length + ' possible bill' + (tracking.suggestions.length === 1 ? '' : 's') + ' to confirm', text: 'Only add payments you actually expect again.', href: 'bills.html#bill-discovery', icon: 'calendar-days' });
    if (reviewCount) tasks.push({ key: 'review', title: 'Quick check · ' + reviewCount + ' payment' + (reviewCount === 1 ? '' : 's'), text: 'Categories can wait. Your payments stay editable.', href: 'review.html?quick=1', icon: 'layers' });
    if (reminders.some(r => r.action === 'weekly')) tasks.push({ key: 'weekly', title: 'Your weekly check-in', text: 'A quick look at money, bills, and what changed.', tool: 'weekly', icon: 'calendar-check' });
    return tasks;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { flowHomeSourceStatus, flowHomeTasks };

/* Report known amounts without treating a retrieval timestamp as bank freshness. */
function flowHomeMoneySource(planning, accounts, today, now=Date.now()) {
    const status=flowHomeSourceStatus(planning,accounts,today,now);
    if(planning.manualBalance)return {...status,amountCents:Number.isSafeInteger(planning.manualBalance.cents)?planning.manualBalance.cents:null,manual:true,confirmedOn:planning.manualBalance.date,rows:[]};
    const ids=planning.selectedAccountIds||[],rows=ids.map(id=>accounts.find(a=>a.id===id)||{id,name:'Spending account',missing:true});
    const known=rows.length>0&&rows.every(a=>a.type==='depository'&&a.currency==='USD'&&Number.isSafeInteger(a.availableCents));
    const sum=known?rows.reduce((n,a)=>n+a.availableCents,0):null;
    return {...status,amountCents:Number.isSafeInteger(sum)?sum:null,manual:false,rows};
}
if(typeof module!=='undefined'&&module.exports)module.exports.flowHomeMoneySource=flowHomeMoneySource;

/* One set of reminder rules for the inbox and the scheduled server sender. */
function flowNotificationItems(snapshot, today = flowToday(), now = Date.now()) {
    const p = snapshot?.flowPlanning;
    if (!p || !validFlowPlanning(p) || !p.setup.completed || !validPlanDate(today) || p.preferences.remindersEnabled === false) return [];
    const tx = Array.isArray(snapshot.transactions) ? snapshot.transactions : [], accounts = snapshot.bankAccounts || [];
    const items = [];
    if (p.preferences.billReminders !== false) {
        for (const bill of getBillTrackingState(p, accounts, tx, today, now).rows) {
            const days = planDays(today, bill.dueDate);
            if (bill.paid || days < -7 || days > 3) continue;
            const waiting = ['pending', 'found', 'amount', 'ambiguous', 'changed', 'refund'].includes(bill.status);
            const stage = days > 0 ? 'soon' : days === 0 ? 'today' : 'overdue';
            items.push({ id: 'bill:' + JSON.stringify([bill.billId, bill.dueDate, stage]), kind:'bill',
                title: waiting ? 'Check ' + bill.name : bill.name + (days > 0 ? ' is coming up' : days === 0 ? ' is due today' : ' needs a check'),
                text: waiting ? 'A payment may already cover this bill.' : days > 0 ? 'Due ' + new Date(bill.dueDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}) : days === 0 ? 'Open Bills to check or mark it paid.' : 'Check whether this bill has been paid.',
                href:'bills.html', date:bill.dueDate, priority:days <= 0 ? 0 : 1,
                push:!waiting && days >= 0, pushText:days === 0 ? 'A bill is due today. Open Flow to check it.' : 'A bill is coming up. Open Flow to see what’s due.' });
        }
    }
    if (p.preferences.budgetReminders !== false) {
        const month=today.slice(0,7), budgets=Object.hasOwn(snapshot.budgetsByMonth || {},month) ? snapshot.budgetsByMonth[month] : snapshot.budgets || [];
        const seen=new Set();
        for (const budget of Array.isArray(budgets) ? budgets : []) {
            if (!budget || typeof budget.category !== 'string' || seen.has(budget.category) || !Number.isFinite(budget.limit) || budget.limit <= 0) continue;
            seen.add(budget.category);
            const limit=Math.round(budget.limit*100),spent=Math.round(getBudgetSpending(budget.category,tx.filter(t=>t.date<=today),month)*100);
            if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(spent) || limit<=0 || spent*100 < limit*80) continue;
            const stage=spent>=limit?'limit':'near',percent=Math.floor(spent/limit*100);
            items.push({id:'budget:'+JSON.stringify([month,budget.category,stage]),kind:'budget',
                title:budget.category+(stage==='limit'?' reached its limit':' is getting close'),
                text:percent+'% of your monthly limit used.',href:'budgets.html?view=categories&month='+month,date:today,
                priority:stage==='limit'?0:2,push:true,pushText:'A budget needs a look. Open Flow to see your plan.'});
        }
        // Payday set-asides use the same recorded spending shown on Home and Plan.
        const tracking=getBillTrackingState(p,accounts,tx,today,now);
        const activity=flowEssentialActivity(p,accounts,tx,today,tracking.excludedPayments);
        for(const reserve of p.essentials){
            if(seen.has(reserve.category)||reserve.amountCents<=0)continue;
            seen.add(reserve.category);
            const used=activity.get(reserve.category)?.usedCents||0;
            if(used*100<reserve.amountCents*80)continue;
            const stage=used>=reserve.amountCents?'limit':'near';
            items.push({id:'reserve:'+JSON.stringify([p.reservePeriodKey||p.periodStartedOn,p.payday.nextDate,reserve.category,stage]),kind:'budget',
                title:reserve.name+(stage==='limit'?' reached its limit':' is getting close'),
                text:Math.floor(used/reserve.amountCents*100)+'% of your payday set-aside used.',href:'budgets.html',date:today,priority:stage==='limit'?0:2,
                push:true,pushText:'A budget needs a look. Open Flow to see your plan.'});
        }
    }
    const snoozes=p.features?.reminders || [];
    return items.filter(item=>!snoozes.some(r=>r.id===item.id&&r.until>=today))
        .sort((a,b)=>a.priority-b.priority||a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
function flowNotificationClock(timeZone, now = Date.now()) {
    try {
        const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
        const get=type=>parts.find(p=>p.type===type)?.value;
        return {today:get('year')+'-'+get('month')+'-'+get('day'),hour:Number(get('hour'))};
    } catch (_) { return null; }
}

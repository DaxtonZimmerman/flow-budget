/* Three setup decisions; saved plans retain the existing step and money schema. */
function flowSetupStage(step) { return step<=2?0:step===3?1:2; }
function flowSetupNext(step) { return flowSetupStage(step)===0?3:flowSetupStage(step)===1?4:5; }
function flowSetupPrevious(step) { return flowSetupStage(step)===2?3:0; }
function flowSetupMoney(planning, choices, accounts, today=flowToday()) {
    const next=JSON.parse(JSON.stringify(planning));
    const ids=[...new Set(choices.selectedAccountIds||[])];
    if(ids.some(id=>!accounts.some(a=>a.id===id&&a.type==='depository'&&a.currency==='USD'&&Number.isSafeInteger(a.availableCents))))throw new Error('Choose an available spending account, or confirm your balance.');
    if(choices.useManual&&!Number.isSafeInteger(choices.balanceCents))throw new Error('Enter your full available balance.');
    if(!choices.useManual&&!ids.length)throw new Error('Choose a spending account, or confirm your balance.');
    if(!validPlanDate(choices.nextDate)||choices.nextDate<=today||planDays(today,choices.nextDate)>366)throw new Error('Choose your next payday or a planning date within the next year.');
    if(!['weekly','biweekly','semimonthly','monthly','irregular'].includes(choices.frequency))throw new Error('Choose a payday schedule.');
    next.selectedAccountIds=ids;next.manualBalance=choices.useManual?{cents:choices.balanceCents,date:today}:null;
    next.payday={nextDate:choices.nextDate,frequency:choices.frequency,anchorDay:next.payday.nextDate===choices.nextDate&&next.payday.frequency===choices.frequency?next.payday.anchorDay||Number(choices.nextDate.slice(-2)):Number(choices.nextDate.slice(-2))};
    return next;
}
function flowPaydaySuggestion(transactions, accounts, selectedIds, today=flowToday()) {
    const groups=new Map(),seen=new Set();
    for(const t of transactions){
        const account=accounts.find(a=>selectedIds.includes(a.id)&&a.accountId===t.accountId&&a.bankConnectionId===t.bankConnectionId);
        if(!account||t.source!=='bank'||t.type!=='Income'||t.category!=='Salary'||t.status==='pending'||!(t.amount>0)||!validPlanDate(t.date)||t.date>today)continue;
        const id=t.bankTransactionId||t.id;if(seen.has(id))continue;seen.add(id);
        const key=JSON.stringify([t.bankConnectionId,t.accountId,String(t.name).trim().toLowerCase()]);
        if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);
    }
    const matches=[];
    for(const group of groups.values()){
        group.sort((a,b)=>b.date.localeCompare(a.date));if(group.length<3||planDays(group[0].date,today)>45)continue;
        const gaps=[planDays(group[1].date,group[0].date),planDays(group[2].date,group[1].date)];
        const frequency=gaps.every(n=>n>=6&&n<=8)?'weekly':gaps.every(n=>n>=13&&n<=15)?'biweekly':gaps.every(n=>n>=28&&n<=32)&&Math.max(...group.slice(0,3).map(t=>Number(t.date.slice(-2))))-Math.min(...group.slice(0,3).map(t=>Number(t.date.slice(-2))))<=1?'monthly':null;
        if(!frequency)continue;let date=group[0].date;for(let i=0;i<60&&date<=today;i++)date=nextPlanDate(date,frequency,Number(group[0].date.slice(-2)));
        if(validPlanDate(date)&&date>today&&planDays(today,date)<=45)matches.push({date,frequency,lastDate:group[0].date});
    }
    matches.sort((a,b)=>b.lastDate.localeCompare(a.lastDate));return matches[0]||null;
}
function flowSetupDraft(storage, owner, base, step, values, today=flowToday()) {
    const key='flow-setup-draft:'+String(owner||'demo');
    if(values===null){storage.removeItem(key);return null;}
    if(values!==undefined){
        const safe=values.filter(([name,value])=>typeof name==='string'&&name.length<=60&&typeof value==='string'&&value.length<=300).slice(0,150);
        storage.setItem(key,JSON.stringify({owner,base,stage:flowSetupStage(step),day:today,values:safe}));return safe;
    }
    try{const draft=JSON.parse(storage.getItem(key)||'null');
        if(!draft||draft.owner!==owner||draft.base!==base||draft.stage!==flowSetupStage(step)||draft.day!==today||!Array.isArray(draft.values)||draft.values.length>150||!draft.values.every(row=>Array.isArray(row)&&row.length===2&&row.every(x=>typeof x==='string')&&row[0].length<=60&&row[1].length<=300))return null;
        return draft.values;
    }catch(_){return null;}
}
if(typeof module!=='undefined'&&module.exports)module.exports={flowSetupStage,flowSetupNext,flowSetupPrevious,flowSetupMoney,flowPaydaySuggestion,flowSetupDraft};

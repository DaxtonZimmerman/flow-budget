/* History-based suggestions and personal goals. These functions never move bank money. */
function flowGrowthDefaults() { return { version:1, goalDetails:[], wealth:{enabled:false,entries:[],excluded:[],history:[]}, subscriptions:[] }; }
function flowGrowth(planning) { return flowFeatures(planning).growth || flowGrowthDefaults(); }
function validFlowGrowthFeatures(f) {
    if(f.version===1)return f.growth===undefined;
    if(!Array.isArray(f.goals))return false;
    const g=f.growth, text=(s,max=200)=>typeof s==='string'&&s.length<=max, cents=n=>Number.isSafeInteger(n)&&n>=0;
    const sourceKey=s=>{if(s==='')return true;try{const k=JSON.parse(s);return Array.isArray(k)&&k.length===4&&k.slice(0,3).every(x=>text(x,300))&&cents(k[3])&&k[3]>0;}catch(_){return false;}};
    const list=(rows,check,max=100)=>Array.isArray(rows)&&rows.length<=max&&rows.every(check)&&new Set(rows.map(r=>r.id)).size===rows.length;
    if(!g||g.version!==1||!list(g.goalDetails,r=>r&&text(r.id)&&f.goals.some(x=>x.id===r.id)&&text(r.description,1000)&&['sparkles','car','plane','house','shield-check','graduation-cap','gift','heart'].includes(r.icon)&&
        (r.photo===''||typeof r.photo==='string'&&r.photo.length<=90000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(r.photo))&&list(r.activity,a=>a&&text(a.id)&&validPlanDate(a.date)&&Number.isSafeInteger(a.cents)&&a.cents!==0,200)))return false;
    if(g.goalDetails.reduce((n,r)=>n+r.photo.length,0)>900000)return false;
    const w=g.wealth;
    if(!w||typeof w.enabled!=='boolean'||!list(w.entries,r=>r&&text(r.id)&&text(r.name,70)&&r.name.trim()&&['asset','debt'].includes(r.kind)&&cents(r.cents)&&validPlanDate(r.date))||
        !Array.isArray(w.excluded)||w.excluded.length>500||w.excluded.some(x=>!text(x,300))||new Set(w.excluded).size!==w.excluded.length||
        !Array.isArray(w.history)||w.history.length>366||w.history.some(r=>!r||!validPlanDate(r.date)||!Number.isSafeInteger(r.cents)||!text(r.scope,10000))||new Set(w.history.map(r=>r.date)).size!==w.history.length)return false;
    return list(g.subscriptions,r=>r&&text(r.id,1000)&&text(r.name,200)&&r.name.trim()&&text(r.provider,30)&&['unknown','apple','google','spotify','netflix','openai'].includes(r.provider)&&cents(r.amountCents)&&r.amountCents>0&&['weekly','monthly','quarterly','yearly'].includes(r.frequency)&&validPlanDate(r.nextDate)&&['active','cancelled','hidden'].includes(r.status)&&text(r.sourceKey,1000)&&sourceKey(r.sourceKey)&&text(r.billId,200)&&validPlanDate(r.confirmedOn)&&
        (r.status!=='cancelled'||validPlanDate(r.cancelledOn)&&validPlanDate(r.effectiveOn))&&Array.isArray(r.baselineKeys)&&r.baselineKeys.length<=5000&&r.baselineKeys.every(x=>text(x,1000))&&
        (r.previousBillEnd===undefined||r.previousBillEnd===''||validPlanDate(r.previousBillEnd))&&(r.endedBillOn===undefined||validPlanDate(r.endedBillOn)),200);
}
function flowEnableGrowth(p) {
    p.features ||= flowFeatureDefaults();
    p.features.growth ||= flowGrowthDefaults();
    p.features.version=2;
    return p.features.growth;
}
function flowUniqueHistory(transactions,today=flowToday()) {
    const map=new Map(),conflicts=new Set();
    for(const t of transactions){
        if(!t||!validPlanDate(t.date)||t.date>today||t.status==='pending'||t.type==='Transfer'||!Number.isSafeInteger(Math.round(t.amount*100)))continue;
        const key=flowTransactionKey(t),fingerprint=JSON.stringify([t.date,t.type,t.amount,t.category,t.allocations,t.relatedExpense]);
        if(conflicts.has(key))continue;
        if(map.has(key)&&map.get(key).fingerprint!==fingerprint){map.delete(key);conflicts.add(key);}
        else map.set(key,{t,fingerprint});
    }
    return [...map.values()].map(x=>x.t);
}
function flowMonthBefore(month,offset=1) { const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1-offset,1)).toISOString().slice(0,7); }
function flowSuggestedBudgets(transactions,targetMonth,today=flowToday()) {
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)||!validPlanDate(today))throw new Error('Choose a valid budget month.');
    const rows=flowUniqueHistory(transactions,today),anchor=targetMonth<today.slice(0,7)?targetMonth:today.slice(0,7);
    const eligible=rows.filter(t=>t.date.slice(0,7)<anchor),first=eligible.map(t=>t.date).sort()[0];
    let months=Array.from({length:3},(_,i)=>flowMonthBefore(anchor,3-i)).filter(m=>first&&(m+'-01')>=first);
    let preliminary=false;
    if(!months.length&&first){months=[eligible.map(t=>t.date.slice(0,7)).sort().at(-1)];preliminary=true;}
    if(!months.length&&rows.some(t=>t.date.slice(0,7)===anchor)&&targetMonth>=anchor){months=[anchor];preliminary=true;}
    const selected=rows.filter(t=>months.includes(t.date.slice(0,7))),cats=new Map();let income=0;
    for(const t of selected){
        income+=flowReportingAmounts(t).incomeCents;
        if(t.type!=='Refund'&&t.amount>=0)continue;
        for(const part of flowTransactionParts(t)){
            if(part.income)continue;
            cats.set(part.category,(cats.get(part.category)||0)+(t.type==='Refund'?-1:1)*part.cents);
        }
    }
    const count=months.length;
    const suggestions=[...cats].filter(([,c])=>c>0).map(([category,c])=>({category,usualCents:Math.round(c/count),suggestedCents:Math.ceil(c/count/500)*500})).sort((a,b)=>b.usualCents-a.usualCents);
    const totalCents=suggestions.reduce((n,r)=>n+r.suggestedCents,0),incomeCents=count?Math.round(income/count):0;
    if(!Number.isSafeInteger(totalCents)||!Number.isSafeInteger(incomeCents)||suggestions.some(r=>!Number.isSafeInteger(r.usualCents)))throw new Error('Check large or invalid history amounts.');
    return {months,preliminary,rows:suggestions,incomeCents,totalCents,hasIncome:incomeCents>0,shortfallCents:incomeCents>0?Math.max(0,totalCents-incomeCents):null};
}
function flowApplySuggestedBudgets(snapshot,month,choices) {
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!choices.length||choices.length>100)throw new Error('Select at least one category.');
    const next=flowCopy(snapshot),saved=next.budgetsByMonth[month]||next.budgets||[],byCategory=new Map(saved.map(r=>[r.category,r]));
    const seen=new Set();
    for(const c of choices){
        if(!c.category?.trim()||seen.has(c.category)||!Number.isSafeInteger(c.cents)||c.cents<=0)throw new Error('Choose a positive amount for each selected category.');
        seen.add(c.category);const old=byCategory.get(c.category);
        byCategory.set(c.category,{...(old||{id:makeRecordId([...byCategory.values()])}),category:c.category,limit:c.cents/100});
    }
    next.budgetsByMonth[month]=[...byCategory.values()];return next;
}
function flowGoalPace(goal,planning,today=flowToday()) {
    const remaining=Math.max(0,goal.targetCents-(goal.remainingCents??goal.reservedCents));
    if(!remaining)return {remainingCents:0,paydays:0,cents:0,overdue:false};
    if(!goal.dueDate||!validPlanDate(goal.dueDate))return {remainingCents:remaining,paydays:null,cents:goal.contributionCents,overdue:false};
    if(goal.dueDate<today)return {remainingCents:remaining,paydays:0,cents:null,overdue:true};
    let date=planning.payday.nextDate,count=0;
    if(!['weekly','biweekly','monthly','semimonthly'].includes(planning.payday.frequency)||!validPlanDate(date))return {remainingCents:remaining,paydays:null,cents:null,overdue:false};
    for(let n=0;n<1000&&date<=goal.dueDate;n++){
        if(date>=today)count++;
        const next=nextPlanDate(date,planning.payday.frequency,planning.payday.anchorDay||Number(planning.payday.nextDate.slice(-2)));if(!next||next<=date)break;date=next;
    }
    return {remainingCents:remaining,paydays:count,cents:count?Math.ceil(remaining/count):null,overdue:false};
}
function flowChangeGoalSavings(planning,goalId,deltaCents,accounts,transactions,today=flowToday()) {
    if(!Number.isSafeInteger(deltaCents)||!deltaCents)throw new Error('Enter an amount greater than zero.');
    const next=flowCopy(planning),goal=flowFeatures(next).goals.find(g=>g.id===goalId);
    if(!goal)throw new Error('This goal was removed. Reopen your goals.');
    const current=paydayEstimate(next,accounts,transactions,today).goals.find(g=>g.id===goalId)?.remainingCents??goal.reservedCents;
    if(current+deltaCents<0||!Number.isSafeInteger(current+deltaCents))throw new Error('You cannot withdraw more than this goal has saved.');
    goal.reservedCents=current+deltaCents;
    goal.coveredBillPayments=flowBillPaymentCoverage(next,getBillTrackingState(next,accounts,transactions,today).rows,accounts);
    const growth=flowEnableGrowth(next);let detail=growth.goalDetails.find(r=>r.id===goalId);
    if(!detail){detail={id:goalId,description:'',photo:'',icon:'sparkles',activity:[]};growth.goalDetails.push(detail);}
    detail.activity.push({id:crypto.randomUUID(),date:today,cents:deltaCents});detail.activity=detail.activity.slice(-200);
    return next;
}
function flowNetWorth(planning,accounts,today=flowToday(),now=Date.now()) {
    const settings=flowGrowth(planning).wealth,rows=[],missing=[],seen=new Set();
    for(const a of accounts){
        if(seen.has(a.id)){missing.push('Duplicate account needs a check');continue;}seen.add(a.id);
        if(settings.excluded.includes(a.id))continue;
        if(a.currency!=='USD'||!['depository','credit','loan','investment'].includes(a.type)||!Number.isSafeInteger(a.currentCents)){missing.push(a.name+': balance unavailable or unsupported');continue;}
        const value=['credit','loan'].includes(a.type)?-a.currentCents:a.currentCents;
        const reported=Date.parse(a.bankUpdatedAt||a.retrievedAt);
        const stale=!Number.isFinite(reported)||now-reported>7*86400000||reported>now+300000;
        if(stale)missing.push(a.name+': balance needs updating');
        rows.push({id:a.id,name:a.name,cents:value,source:'bank',date:planDateAt(a.bankUpdatedAt||a.retrievedAt),dated:Boolean(a.bankUpdatedAt),stale});
    }
    for(const r of settings.entries){
        if(seen.has(r.id)){missing.push(r.name+': duplicate item needs a check');continue;}seen.add(r.id);
        const stale=planDays(r.date,today)>31||r.date>today;if(stale)missing.push(r.name+': update your entered value');
        rows.push({...r,cents:r.kind==='debt'?-r.cents:r.cents,source:'manual',stale});
    }
    const assetsCents=rows.reduce((n,r)=>n+Math.max(0,r.cents),0),debtsCents=rows.reduce((n,r)=>n+Math.max(0,-r.cents),0);
    const cents=assetsCents-debtsCents;
    if(![assetsCents,debtsCents,cents].every(Number.isSafeInteger))throw new Error('Check your net worth amounts.');
    const scope=JSON.stringify(rows.map(r=>r.id).sort());
    return {rows,missing,assetsCents,debtsCents,cents,scope,ready:rows.length>0&&!missing.length,enabled:settings.enabled,excludedCount:settings.excluded.length};
}
function flowRecordNetWorth(planning,accounts,today=flowToday(),now=Date.now()) {
    const model=flowNetWorth(planning,accounts,today,now);if(!model.enabled||!model.ready)return planning;
    const previous=flowGrowth(planning).wealth.history.find(r=>r.date===today);
    if(previous?.cents===model.cents&&previous.scope===model.scope)return planning;
    const next=flowCopy(planning),w=flowEnableGrowth(next).wealth;
    w.history=w.history.filter(r=>r.date!==today);w.history.push({date:today,cents:model.cents,scope:model.scope});w.history.sort((a,b)=>a.date.localeCompare(b.date));w.history=w.history.slice(-366);return next;
}
function flowSubscriptionProvider(name) {
    const n=String(name).toLowerCase();
    if(/\bspotify\b/.test(n))return 'spotify';if(/\bnetflix\b/.test(n))return 'netflix';if(/\b(openai|chatgpt)\b/.test(n))return 'openai';if(/apple\.com\/bill|\bitunes\b|\bapple (music|tv|one)\b/.test(n))return 'apple';if(/google\s*\*?\s*(play|youtube)|\byoutube (premium|music)\b/.test(n))return 'google';return 'unknown';
}
function flowSubscriptionKey(t) { return JSON.stringify([t.bankConnectionId||t.source||'manual',t.accountId||'',billName(t.name),Math.round(Math.abs(t.amount)*100)]); }
function flowSubscriptions(planning,accounts,transactions,today=flowToday()) {
    const saved=flowGrowth(planning).subscriptions,rows=flowUniqueHistory(transactions,today),groups=new Map();
    for(const t of rows){if(t.type!=='Expense'||t.amount>=0)continue;const key=flowSubscriptionKey(t);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
    const suggestions=[];
    for(const [sourceKey,group] of groups){
        if(saved.some(r=>r.sourceKey===sourceKey))continue;
        group.sort((a,b)=>b.date.localeCompare(a.date));const latest=group[0],previous=group[1],provider=flowSubscriptionProvider(latest.name);
        if(!previous||provider==='unknown'&&!['Bills','Entertainment'].includes(latest.category)&&!planning.bills.some(b=>b.tracking&&billTrackingKey(b.tracking)===billSourceKey(latest)))continue;
        const days=planDays(previous.date,latest.date),frequency=days>=26&&days<=35?'monthly':days>=350&&days<=380?'yearly':null;
        if(!frequency)continue;
        const nextDate=nextPlanDate(latest.date,frequency);
        if(nextDate<addPlanDays(today,-7))continue;
        const bill=planning.bills.find(b=>b.tracking&&billTrackingKey(b.tracking)===billSourceKey(latest));
        suggestions.push({id:sourceKey,name:latest.name,amountCents:Math.round(-latest.amount*100),frequency,nextDate,provider,sourceKey,billId:bill?.id||'',sampleCount:group.length,baselineKeys:group.map(flowTransactionKey)});
    }
    const tracked=saved.filter(r=>r.status!=='hidden').map(r=>{
        const charges=rows.filter(t=>t.type==='Expense'&&t.amount<0&&
            (r.sourceKey?flowSubscriptionKey(t)===r.sourceKey:billName(t.name)===billName(r.name)));
        // A provider can raise the price. Watch the merchant/account as well as the original amount.
        const source=r.sourceKey?JSON.parse(r.sourceKey):null;
        const later=rows.filter(t=>t.type==='Expense'&&t.amount<0&&t.date>=r.effectiveOn&&
            (source?String(t.bankConnectionId||t.source||'manual')===String(source[0])&&String(t.accountId||'')===String(source[1])&&billName(t.name)===source[2]:billName(t.name)===billName(r.name))&&!r.baselineKeys.includes(flowTransactionKey(t)));
        const latestDate=charges.map(t=>t.date).sort().at(-1)||null;
        const renewal=r.status==='active'&&latestDate&&latestDate>=r.nextDate?nextPlanDate(latestDate,r.frequency):r.nextDate;
        return {...r,nextDate:renewal||r.nextDate,charges,newCharge:r.status==='cancelled'&&later.length>0,latestDate};
    });
    const active=tracked.filter(r=>r.status==='active'||r.status==='cancelled'&&r.effectiveOn>today);
    const yearlyCents=active.reduce((n,r)=>n+r.amountCents*(r.frequency==='weekly'?52:r.frequency==='yearly'?1:r.frequency==='quarterly'?4:12),0);
    if(!Number.isSafeInteger(yearlyCents))throw new Error('Check your subscription amounts.');
    return {tracked,suggestions,monthlyCents:Math.round(yearlyCents/12),yearlyCents};
}
function flowSetSubscriptionStatus(planning,subscriptionId,status,transactions,effectiveOn='',today=flowToday()) {
    const next=flowCopy(planning),r=flowEnableGrowth(next).subscriptions.find(r=>r.id===subscriptionId);
    if(!r)throw new Error('Reopen this subscription.');
    if(!['active','cancelled','hidden'].includes(status)||status==='cancelled'&&(!validPlanDate(effectiveOn)||effectiveOn<today))throw new Error('Choose the provider’s effective cancellation date, today or later.');
    r.status=status;
    if(status==='cancelled'){r.cancelledOn=today;r.effectiveOn=effectiveOn;r.baselineKeys=flowUniqueHistory(transactions,today).map(flowTransactionKey).slice(-5000);}
    return next;
}
if(typeof module!=='undefined'&&module.exports)module.exports={flowSuggestedBudgets,flowNetWorth,flowGoalPace};

/* Account-only, explicit replacement preview. Background sync cannot apply it. */
(function () {
    let dialog, retry, busy = false, currentOwner = '';
    const el = (tag, text, className) => { const node=document.createElement(tag); if(text)node.textContent=text;if(className)node.className=className;return node; };
    function stillHere(owner) { return flowStorage.getItem('flow_user_id') === owner && (!window.FlowAuth || window.FlowAuth.authorized && window.FlowAuth.user?.id === owner); }
    async function open(connection) {
        if (busy) return;
        clearTimeout(retry);
        dialog?.remove();
        const owner=flowStorage.getItem('flow_user_id'); currentOwner=owner;
        if (!owner || !stillHere(owner)) return;
        dialog=el('dialog',null,'bank-recovery-dialog');dialog.setAttribute('aria-labelledby','bank-recovery-title');
        const heading=el('div',null,'dialog-heading'),title=el('h2','Restore bank updates');title.id='bank-recovery-title';
        const close=el('button','Later','back-button');close.type='button';close.onclick=()=>dialog.close();heading.append(title,close);
        const content=el('div'),status=el('p','Preparing a preview…');status.setAttribute('role','status');
        dialog.append(heading,status,content);document.body.append(dialog);
        dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
        dialog.addEventListener('close',()=>{clearTimeout(retry);});dialog.showModal();
        async function load() {
            clearTimeout(retry);
            if (!dialog.open || !stillHere(owner) || busy) return;
            busy=true;content.replaceChildren();status.textContent='Checking available bank history…';
            try {
                if (await flowSync() !== true || flowStorage.getItem('flow_pending') === '1') throw new Error('Your changes need to finish saving. Reconnect to the internet, then try again.');
                const feed=await bankRequest('recovery-preview',{connection_id:connection.id});
                if (!stillHere(owner) || !dialog.open) return;
                if (!feed.history_complete) {
                    status.textContent='Your bank is preparing its history. Your saved activity stays as it is. Flow will check again automatically.';
                    const check=el('button','Check again','back-button');check.type='button';check.onclick=load;content.append(check);
                    retry=setTimeout(load,30000);return;
                }
                const baseline=getFlowSnapshot(),revision=Number(flowStorage.getItem('flow_revision'));
                const sources=bankRecoverySources(baseline).filter(s=>s.id!==connection.id);
                if (!sources.length) throw new Error('The saved bank history could not be found. Nothing has been replaced.');
                const accounts=bankAccountSnapshot(connection.id,feed.accounts,feed.last_synced_at);
                status.textContent='Match your saved accounts, then review the switch. Your original bank connection stays untouched.';
                const sourceLabel=el('label','Saved bank feed'),sourceSelect=el('select');sourceSelect.setAttribute('aria-label','Saved bank feed');
                for (const source of sources) {const option=el('option',`${source.accounts.map(a=>a.name).join(' + ')} · ${source.count} saved transactions`);option.value=source.id;sourceSelect.append(option);}
                sourceLabel.append(sourceSelect);content.append(sourceLabel);
                const mappings=el('div',null,'bank-recovery-mappings'),preview=el('div',null,'bank-recovery-preview');content.append(mappings,preview);
                function showMappings() {
                    mappings.replaceChildren();preview.replaceChildren();
                    const source=sources.find(s=>s.id===sourceSelect.value),suggestions=bankRecoverySuggestions(source,accounts);
                    const selectors=[];
                    for(const old of source.accounts){
                        const label=el('label',`${old.name} →`),select=el('select');select.setAttribute('aria-label',`New account for ${old.name}`);
                        const empty=el('option','Choose the matching account');empty.value='';select.append(empty);
                        for(const next of accounts){const option=el('option',next.name);option.value=next.accountId;select.append(option);}
                        select.value=suggestions[old.accountId]||'';select.onchange=()=>preview.replaceChildren();label.append(select);mappings.append(label);selectors.push([old.accountId,select]);
                    }
                    const review=el('button','Preview switch','save-button');review.type='button';mappings.append(review);
                    review.onclick=()=>{
                        preview.replaceChildren();
                        try {
                            if (JSON.stringify(getFlowSnapshot())!==JSON.stringify(baseline) || Number(flowStorage.getItem('flow_revision'))!==revision) throw new Error('Your saved work changed. Close this window and open a fresh preview.');
                            const result=prepareBankRecovery(baseline,source.id,connection.id,feed,Object.fromEntries(selectors.map(([id,s])=>[id,s.value])));
                            preview.append(el('h3','Ready to switch feeds'),el('p',`${result.oldCount} old bank imports will be replaced by ${result.newCount} entries from the new feed${result.from?` (${result.from} to ${result.through})`:''}.`),
                                el('p',`${result.matchedCount} matched payment${result.matchedCount===1?" keeps its":"s keep their"} saved choices. ${result.keptCount} other entr${result.keptCount===1?"y stays":"ies stay"} in your activity, including anything entered manually.`));
                            if(result.archivedCount)preview.append(el('p',`${result.archivedCount} old entr${result.archivedCount===1?"y could":"ies could"} not be matched confidently. The original history and edits will stay in a downloadable recovery copy instead of the active feed.`, 'bank-warning'));
                            preview.append(el('p','Flow saves a full recovery copy here and in your account before switching. Your plan keeps its account selections; check the new bank balances afterward.'));
                            const confirmLabel=el('label',null,'bank-recovery-confirm'),confirm=el('input');confirm.type='checkbox';confirmLabel.append(confirm,document.createTextNode('I reviewed these accounts and the history being replaced.'));
                            const apply=el('button','Switch to this bank feed','save-button');apply.type='button';apply.disabled=true;confirm.onchange=()=>apply.disabled=!confirm.checked;
                            preview.append(confirmLabel,apply);
                            apply.onclick=async()=>{
                                if(busy||!stillHere(owner))return;
                                busy=true;apply.disabled=true;close.disabled=true;review.disabled=true;sourceSelect.disabled=true;selectors.forEach(([,s])=>s.disabled=true);confirm.disabled=true;
                                status.textContent='Saving a recovery copy and switching feeds…';
                                try {
                                    const expected=JSON.stringify(baseline);
                                    if(flowSyncing||bankRefreshing||flowStorage.getItem('flow_pending')==='1'||JSON.stringify(getFlowSnapshot())!==expected||Number(flowStorage.getItem('flow_revision'))!==revision)throw new Error('Your saved work changed. Reopen a fresh preview before switching.');
                                    keepFlowRecoveryCopy(owner,baseline,'bank-feed-replacement');
                                    const saved=await bankRequest('complete-recovery',{connection_id:connection.id,expected_revision:revision,expected_cursor:feed.cursor,data:result.data});
                                    if(!stillHere(owner))return;
                                    // A late local edit is protected by normal cloud conflict recovery, never overwritten here.
                                    const applied=acceptFlowAccountCopy(owner,saved.revision,saved.data,{expectedOwner:owner,expectedSnapshot:expected});
                                    if(!applied){await flowSync();throw new Error('The bank feed is active. Flow is syncing a later edit; close and reopen Account to check it.');}
                                    document.dispatchEvent(new Event('flow-recovery-updated'));
                                    status.textContent='Bank updates are restored. New activity will sync automatically as your bank reports it.';content.replaceChildren();
                                    const done=el('button','Done','save-button');done.type='button';done.onclick=()=>dialog.close();content.append(done);
                                    await showBankConnections();document.dispatchEvent(new CustomEvent('flow-bank-updated',{detail:{changed:true}}));
                                }catch(error){status.textContent=error.message;const again=el('button','Open a fresh preview','back-button');again.type='button';again.onclick=load;content.append(again);}
                                finally{busy=false;close.disabled=false;}
                            };
                        }catch(error){status.textContent=error.message;}
                    };
                }
                sourceSelect.onchange=showMappings;showMappings();
            }catch(error){if(stillHere(owner)){status.textContent=error.message;const again=el('button','Try again','back-button');again.type='button';again.onclick=load;content.append(again);}}
            finally{busy=false;}
        }
        await load();
    }
    window.FlowBankRecovery={open};
    window.addEventListener('storage',event=>{if(event.key==='flow_user_id'&&currentOwner&&!stillHere(currentOwner)){clearTimeout(retry);dialog?.close();dialog?.remove();}});
})();

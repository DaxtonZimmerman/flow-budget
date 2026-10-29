/* Small choices and focused review. Financial records are saved by existing forms. */
function flowQuickPaydays(today) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today || '')) return [];
    const base=new Date(today+'T12:00:00Z');
    if(!Number.isFinite(base.getTime())||base.toISOString().slice(0,10)!==today)return [];
    const day=n=>{const d=new Date(base);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
    let end=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0,12));
    if(end<=base)end=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+2,0,12));
    return [{label:'Next Friday',date:day((5-base.getUTCDay()+7)%7||7)},
        {label:'In 2 weeks',date:day(14)},{label:'Month end',date:end.toISOString().slice(0,10)}];
}
if(typeof module!=='undefined'&&module.exports)module.exports={flowQuickPaydays};
if(typeof document!=='undefined') (function(){
    let queued=false,groupKey='',groupIndex=0;
    const text=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
    function paydayChoices(){
        for(const input of document.querySelectorAll('#setup-form input[name=payday], #payday-dialog input[name=date][type=date]')){
            if(input.dataset.quickPayday)continue;
            if(input.closest('#payday-dialog')&&!/payday/i.test(input.closest('dialog').querySelector('h2')?.textContent||''))continue;
            input.dataset.quickPayday='true';
            const options=document.createElement('div');options.className='quick-paydays';options.setAttribute('role','group');options.setAttribute('aria-label','Quick payday dates');
            for(const choice of flowQuickPaydays(flowToday())){
                const button=document.createElement('button');button.type='button';button.className='quick-date';button.textContent=choice.label;
                button.onclick=()=>{input.value=choice.date;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
                    for(const b of options.children)b.setAttribute('aria-pressed',String(b===button));};
                button.setAttribute('aria-pressed','false');options.append(button);
            }
            input.closest('label').after(options);
        }
    }
    function reviewPages(){
        const holder=document.querySelector('#quick-review-groups');if(!holder)return;
        const rows=[...holder.querySelectorAll('.quick-review-group')];
        let pager=document.querySelector('#review-pager');
        if(!pager){
            pager=document.createElement('div');pager.id='review-pager';pager.className='review-pager';
            const previous=document.createElement('button'),status=document.createElement('span'),next=document.createElement('button');
            previous.type=next.type='button';previous.className=next.className='back-button';previous.textContent='Back';next.textContent='Next';
            status.setAttribute('role','status');status.setAttribute('aria-live','polite');pager.append(previous,status,next);holder.before(pager);
            const go=delta=>{groupIndex=Math.max(0,Math.min(rowsNow().length-1,groupIndex+delta));groupKey=rowsNow()[groupIndex]?.dataset.groupKey||'';reviewPages();holder.closest('dialog').scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});};
            const rowsNow=()=>[...holder.querySelectorAll('.quick-review-group')];previous.onclick=()=>go(-1);next.onclick=()=>go(1);
        }
        pager.hidden=rows.length<2;if(!rows.length)return;
        const kept=rows.findIndex(r=>r.dataset.groupKey===groupKey);groupIndex=kept>=0?kept:Math.min(groupIndex,rows.length-1);groupKey=rows[groupIndex].dataset.groupKey;
        rows.forEach((row,i)=>{row.hidden=i!==groupIndex;});
        pager.children[0].disabled=groupIndex===0;pager.children[2].disabled=groupIndex===rows.length-1;
        text(pager.children[1],(groupIndex+1)+' of '+rows.length);
    }
    function refresh(){queued=false;paydayChoices();reviewPages();}
    function schedule(){if(!queued){queued=true;queueMicrotask(refresh);}}
    new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true});
    document.addEventListener('DOMContentLoaded',schedule);schedule();
})();

/* Category chart -> contributing payments -> existing single-payment editor. */
(function(){
    let dialog, selected, invoker, owner, activePayment;
    const make=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
    const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
    const current=()=>owner===flowStorage.getItem('flow_user_id')&&(!window.FlowAuth||window.FlowAuth.authorized&&(typeof flowDemoMode!=='undefined'&&flowDemoMode||window.FlowAuth.user?.id===owner));
    function render(){
        if(!dialog?.open||!selected)return;
        if(!current()){dialog.close();return;}
        const rows=categoryActivity(loadTransactions(),selected.category,selected.month);
        const total=rows.reduce((sum,r)=>sum+r.cents,0),body=dialog.querySelector('.category-activity-body');
        const heading=make('div',undefined,'category-activity-total');heading.append(make('strong',money(total)),make('span',rows.length+' '+(rows.length===1?'payment':'payments')));
        const list=make('div',undefined,'category-activity-list');
        for(const row of rows){
            const t=row.transaction,button=make('button',undefined,'category-activity-row');button.type='button';button.dataset.id=String(t.id);
            button.setAttribute('aria-label','Open '+t.name+' transaction');
            const copy=make('span');copy.append(make('strong',t.name||'Payment'),make('small',new Date(t.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})+(row.split?' · Split payment':row.cents<0?' · Refund':'')));
            const amount=make('strong',(row.cents<0?'−':'')+money(Math.abs(row.cents)));if(row.cents<0)amount.className='income-text';
            button.append(copy,amount,make('span','›','category-activity-arrow'));
            button.onclick=()=>{if(!current())return;activePayment=String(t.id);if(!window.FlowTransactionDetails.open(t.id))activePayment=null;};list.append(button);
        }
        if(!rows.length)list.append(make('p','No payments in this category for this month.','detail-help'));
        body.replaceChildren(heading,make('p','Tap a payment to change its category.','detail-help'),list);
    }
    function open(target){
        const category=target.dataset.categoryActivity,month=target.dataset.categoryMonth;
        if(!category||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))return;
        invoker=target;owner=flowStorage.getItem('flow_user_id');selected={category,month};
        if(!dialog){
            dialog=make('dialog',undefined,'transaction-details-dialog category-activity-dialog');dialog.id='category-activity-dialog';dialog.setAttribute('aria-labelledby','category-activity-title');
            const head=make('div',undefined,'dialog-head'),titles=make('div'),period=make('p',undefined,'small-label'),title=make('h2');period.id='category-activity-period';title.id='category-activity-title';titles.append(period,title);
            const close=make('button','×','icon-button');close.type='button';close.setAttribute('aria-label','Close category');close.onclick=()=>dialog.close();head.append(titles,close);
            dialog.append(head,make('div',undefined,'category-activity-body'));document.body.append(dialog);
            dialog.addEventListener('close',()=>{activePayment=null;if(current()&&invoker?.isConnected)invoker.focus({preventScroll:true});});
            dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
        }
        dialog.querySelector('#category-activity-title').textContent=category;
        dialog.querySelector('#category-activity-period').textContent=new Date(month+'-01T12:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'});
        if(!dialog.open)dialog.showModal();render();dialog.scrollTop=0;
    }
    document.addEventListener('click',event=>{const target=event.target.closest('[data-category-activity]');if(target)open(target);});
    for(const event of ['flow-transaction-updated','flow-transaction-data-updated','flow-transaction-view-refresh'])document.addEventListener(event,render);
    document.addEventListener('close',event=>{
        if(event.target.id!=='transaction-details-dialog'||!dialog?.open||!activePayment)return;
        const id=activePayment;activePayment=null;render();
        const row=[...dialog.querySelectorAll('.category-activity-row')].find(n=>n.dataset.id===id);
        (row||dialog.querySelector('[aria-label="Close category"]'))?.focus({preventScroll:true});
    },true);
    window.addEventListener('storage',event=>{if(event.key==='flow_user_id')render();});
})();

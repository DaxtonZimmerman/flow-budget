/* The demo has separate session-only storage and no authenticated client. */
var flowDemoMode = /\/demo\//.test(location.pathname);
var flowStorage = localStorage;
if (flowDemoMode) {
    const prefix = 'flow-demo-v1:';
    flowStorage = {
        getItem: key => sessionStorage.getItem(prefix + key),
        setItem: (key, value) => sessionStorage.setItem(prefix + key, String(value)),
        removeItem: key => sessionStorage.removeItem(prefix + key)
    };
    if (!flowStorage.getItem('flowDemoSeeded')) {
        const today = new Date(), day = d => { const x = new Date(today.getFullYear(), today.getMonth(), today.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
        const rows = [
            { id:'demo-groceries',name:'Corner Market',amount:-42.80,category:'Food',date:day(-1),type:'Expense',notes:'Groceries for the week' },
            { id:'demo-friends',name:'Venmo',amount:-18,category:'Other',date:day(-1),type:'Expense',notes:'Dinner with friends',reviewStatus:'needs-review' },
            { id:'demo-pay',name:'Paycheck',amount:1250,category:'Salary',date:day(-5),type:'Income' },
            { id:'demo-music',name:'Music subscription',amount:-10,category:'Entertainment',date:day(-4),type:'Expense' }
        ].map(t => ({ source:'manual',status:'posted',reviewStatus:'reviewed',notes:'',...t }));
        flowStorage.setItem('transactions',JSON.stringify(rows));
        flowStorage.setItem('bankAccounts','[]');
        flowStorage.setItem('flowPlanning',JSON.stringify({version:1,setup:{step:0,completed:true},periodStartedOn:day(0),selectedAccountIds:[],manualBalance:{cents:50000,date:day(0)},payday:{nextDate:day(7),frequency:'biweekly'},bills:[{id:'demo-phone',name:'Phone',amountCents:4500,nextDate:day(3),frequency:'monthly'}],billPaymentDecisions:[],dismissedBillSuggestions:[],billsConfirmed:true,essentials:[{id:'food',name:'Food & groceries',category:'Food',amountCents:10000},{id:'travel',name:'Transport',category:'Transport',amountCents:4000}],cushionCents:5000,reservesConfirmed:true,preferences:{billReminders:true,autoCategories:true}}));
        flowStorage.setItem('flowDemoSeeded','1');
    }
    // The duplicate demo pages keep relative navigation inside /demo/.
    document.addEventListener('DOMContentLoaded', () => {
        const banner = document.createElement('div'); banner.className='demo-banner'; banner.setAttribute('role','status');
        const label = document.createElement('span'); label.textContent='Demo workspace · sample money · changes stay in this tab';
        const reset=document.createElement('button');reset.type='button';reset.textContent='Reset demo';reset.addEventListener('click',()=>{for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key.startsWith(prefix))sessionStorage.removeItem(key);}location.reload();});
        const exit=document.createElement('a');exit.href='../index.html';exit.textContent='Exit demo';banner.append(label,reset,exit);document.body.prepend(banner);
        for (const form of document.querySelectorAll('#sign-in-form, #signin-form, #auth-form')) { for (const control of form.querySelectorAll('input,button')) control.disabled=true; }
    });
}

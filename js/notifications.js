/* Private reminder inbox and opt-in Web Push. Opening Flow never prompts for permission. */
(function(){
    const demo=typeof flowDemoMode!=='undefined'&&flowDemoMode;
    const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const root=new URL(demo?'../':'./',location.href);
    let dialog,bell,owner=null,items=[],readIds=new Set(),server=null,subscription=null,busy=false,queued=false,lastClock='',statusText='',requestedOpen=false;
    const identity=()=>demo?'demo':window.FlowAuth?.authorized&&FlowAuth.user?.id===flowStorage.getItem('flow_user_id')?FlowAuth.user.id:null;
    const storageKey=()=> 'flow-notifications-read:'+owner;
    function unread(){return items.filter(i=>!readIds.has(i.id)).length;}
    function icons(){if(typeof lucide!=='undefined')lucide.createIcons();}
    function button(label,action,cls='back-button'){const b=make('button',label,cls);b.type='button';b.dataset.notificationAction=action;return b;}
    function markRead(ids){for(const id of ids)readIds.add(id);try{flowStorage.setItem(storageKey(),JSON.stringify([...readIds].slice(-300)));}catch{}updateBell();}
    function updateBell(){if(!bell)return;const count=unread();bell.setAttribute('aria-label','Notifications'+(count?', '+count+' unread':''));bell.querySelector('.notification-dot').hidden=!count;}
    function supported(){return 'Notification' in window&&'PushManager' in window&&'serviceWorker' in navigator&&window.isSecureContext;}
    function isPhoneTab(){return /iPad|iPhone|iPod/.test(navigator.userAgent)&&!matchMedia('(display-mode:standalone)').matches&&!navigator.standalone;}
    async function request(body,expected=owner){
        if(demo||!expected||identity()!==expected)throw Error('Sign in to enable phone notifications.');
        const client=getFlowClient();if(!client)throw Error('Connect to the internet and try again.');
        let timer;
        const result=await Promise.race([client.functions.invoke('flow-notifications',{body}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Notifications took too long. Try again shortly.')),10000);})]).finally(()=>clearTimeout(timer));
        if(identity()!==expected)throw Error('Your account changed. Reopen notifications.');
        if(result.error){let detail;try{detail=await result.error.context?.json();}catch{}throw Error(detail?.error||'Could not connect to notifications. Try again shortly.');}
        if(result.data?.error)throw Error(result.data.error);return result.data;
    }
    async function deviceState(){
        const expected=owner;if(!expected)return;
        try{if(supported()){const registration=await navigator.serviceWorker.getRegistration(root.href);const sub=await registration?.pushManager.getSubscription()||null;if(owner===expected)subscription=sub;}}catch{}
        if(demo||identity()!==expected)return;
        try{const response=await request({action:'status',subscription:subscription?.toJSON()},expected);if(owner===expected)server=response;}
        catch{if(owner===expected)server={ready:false};}
        if(owner===expected&&dialog?.open)render();
    }
    function preference(label,key,value){const wrap=make('label',undefined,'notification-preference');const input=make('input');input.type='checkbox';input.dataset.notificationPreference=key;input.checked=value;wrap.append(make('span',label),input);return wrap;}
    function render(){
        if(!dialog?.open)return;if(!owner||identity()!==owner){dialog.close();return;}
        const previousFocus=document.activeElement,focusKey=previousFocus?.dataset.notificationPreference;
        const body=dialog.querySelector('.notification-body');body.replaceChildren();
        const p=loadFlowPlanning(),enabled=p.preferences.remindersEnabled!==false;
        const tabs=make('div',undefined,'notification-inbox-tools');tabs.append(make('p',items.length?items.length+' current '+(items.length===1?'reminder':'reminders'):'You’re all caught up.','detail-help'));
        if(unread())tabs.append(button('Mark all read','read-all','inline-link'));body.append(tabs);
        if(!items.length){const empty=make('div',undefined,'notification-empty');empty.innerHTML='<i data-lucide="bell-check" aria-hidden="true"></i>';empty.append(make('h3',enabled?'Nothing needs your attention':'Reminders are paused'),make('p',enabled?'Bills and budget reminders will appear here.':'Turn them on below whenever you’re ready.'));body.append(empty);}
        const list=make('div',undefined,'notification-list');
        for(const item of items){
            const row=make('article',undefined,'notification-row'+(!readIds.has(item.id)?' is-unread':''));
            const symbol=make('span',undefined,'notification-symbol');symbol.innerHTML='<i data-lucide="'+(item.kind==='bill'?'calendar-days':'wallet')+'" aria-hidden="true"></i>';
            const copy=make('div',undefined,'notification-copy');copy.append(make('h3',item.title),make('p',item.text));
            const actions=make('div',undefined,'notification-row-actions'),link=make('a',item.kind==='bill'?'Open bills':'Open plan','inline-link');link.href=item.href;link.onclick=()=>{markRead([item.id]);dialog.close();};
            const later=button('Tomorrow','snooze','inline-link');later.dataset.id=item.id;
            actions.append(link,later);copy.append(actions);row.append(symbol,copy);list.append(row);
        }
        body.append(list);
        const settings=make('details',undefined,'notification-settings');settings.open=dialog.dataset.settingsOpen==='true';
        settings.append(make('summary','Notification settings'));
        settings.addEventListener('toggle',()=>{dialog.dataset.settingsOpen=String(settings.open);});
        settings.append(preference('Reminders', 'remindersEnabled',enabled),preference('Upcoming bills','billReminders',p.preferences.billReminders!==false),preference('Budget limits','budgetReminders',p.preferences.budgetReminders!==false));
        const phone=make('div',undefined,'notification-phone-settings');phone.append(make('h3','On this device'));
        let label;
        if(demo)label='Phone notifications are available in your signed-in Flow app.';
        else if(!supported()||isPhoneTab())label='On iPhone, open Flow from your Home Screen to enable notifications.';
        else if(Notification.permission==='denied')label='Notifications are blocked. You can allow Flow in your device’s notification settings.';
        else if(!server?.ready)label='Phone notifications are being set up. Your inbox works here.';
        else label=subscription&&server.subscribed?'Phone notifications are on.':'Get a nudge without opening Flow.';
        phone.append(make('p',label,'detail-help'));
        if(!demo&&supported()&&!isPhoneTab()&&Notification.permission!=='denied'&&server?.ready){
            const on=subscription&&server.subscribed;
            phone.append(button(on?'Turn off on this device':'Enable on this device',on?'disable':'enable','save-button'));
            if(on)phone.append(button('Send a test','test','inline-link'));
        }
        phone.append(make('p','9 AM–8 PM · no balances or amounts on your lock screen','detail-help'));settings.append(phone);body.append(settings);
        const status=make('p',statusText,'notification-status');status.setAttribute('role','status');body.append(status);
        for(const control of body.querySelectorAll('button,input'))control.disabled=busy;
        if(focusKey)body.querySelector('[data-notification-preference="'+focusKey+'"]')?.focus({preventScroll:true});
        else if(previousFocus&&!previousFocus.isConnected)dialog.querySelector('[aria-label="Close notifications"]')?.focus({preventScroll:true});
        icons();
    }
    function refresh(){
        queued=false;const next=identity();
        if(next!==owner){
            const previous=owner,previousSubscription=subscription;owner=next;server=null;items=[];subscription=null;readIds=new Set();statusText='';dialog?.close();
            if(previous&&!demo)previousSubscription?.unsubscribe().catch(()=>{});
            if(owner){try{const saved=JSON.parse(flowStorage.getItem(storageKey())||'[]');if(Array.isArray(saved))readIds=new Set(saved.filter(x=>typeof x==='string'));}catch{}deviceState();}
        }
        if(!bell){const toolbar=document.querySelector('.toolbar-actions');if(toolbar){bell=button('','open','notification-launch');bell.setAttribute('aria-haspopup','dialog');bell.innerHTML='<i data-lucide="bell" aria-hidden="true"></i><span class="notification-dot" hidden></span>';toolbar.insertBefore(bell,toolbar.querySelector('[data-open-account]'));icons();}}
        if(bell)bell.hidden=!owner;
        if(!owner)return;
        try{items=flowNotificationItems(getFlowSnapshot());}catch{items=[];}
        updateBell();render();
        if((location.hash==='#notifications'||requestedOpen)&&!dialog?.open){requestedOpen=false;open();}
    }
    function schedule(){if(!queued){queued=true;queueMicrotask(refresh);}}
    function open(){
        if(!owner)return;
        if(!dialog){
            dialog=make('dialog',undefined,'transaction-details-dialog notification-dialog');dialog.id='flow-notifications-dialog';dialog.setAttribute('aria-labelledby','notification-title');
            const head=make('div',undefined,'dialog-head');head.append(make('h2','Notifications'));head.firstChild.id='notification-title';const close=button('×','close','icon-button');close.setAttribute('aria-label','Close notifications');head.append(close);
            dialog.append(head,make('div',undefined,'notification-body'));document.body.append(dialog);
            dialog.addEventListener('close',()=>{if(location.hash==='#notifications')history.replaceState(null,'',location.pathname+location.search);bell?.focus({preventScroll:true});});
            dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
        }
        if(!dialog.open)dialog.showModal();render();deviceState();
    }
    function savePlan(update){
        const expected=owner;if(!expected||identity()!==expected)throw Error('Reopen notifications after signing in.');
        const p=JSON.parse(JSON.stringify(loadFlowPlanning()));update(p);if(!validFlowPlanning(p))throw Error('Could not save this choice.');
        saveFlowPlanning(p);schedule();
    }
    async function disable(){
        if(!supported())return;const expected=owner,registration=await navigator.serviceWorker.getRegistration(root.href),sub=await registration?.pushManager.getSubscription();
        if(sub){const removed=await sub.unsubscribe();if(identity()===expected)try{await request({action:'unsubscribe',subscription:sub.toJSON()},expected);}catch(error){if(!removed)throw error;}}
        for(const n of await registration?.getNotifications()||[])n.close();subscription=null;if(server)server.subscribed=false;
    }
    async function enable(){
        if(!server?.ready)throw Error('Phone notifications are still being set up.');
        const expected=owner,permission=await Notification.requestPermission();
        if(permission!=='granted')throw Error('Your inbox is ready. Phone notifications remain off.');
        const registration=await navigator.serviceWorker.getRegistration(root.href);if(!registration?.active)throw Error('Flow is finishing its update. Try again in a moment.');if(identity()!==expected)throw Error('Your account changed. Try again.');
        let sub=await registration.pushManager.getSubscription(),created=false;
        try{
            if(!sub){const base64=server.publicKey.replace(/-/g,'+').replace(/_/g,'/');const bytes=Uint8Array.from(atob(base64+'='.repeat((4-base64.length%4)%4)),c=>c.charCodeAt(0));sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});created=true;}
            await request({action:'subscribe',subscription:sub.toJSON(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone},expected);subscription=sub;server.subscribed=true;
        }catch(error){if(created)await sub?.unsubscribe();throw error;}
    }
    document.addEventListener('click',async event=>{
        const control=event.target.closest('[data-notification-action]');if(!control)return;const action=control.dataset.notificationAction;
        if(action==='open'){statusText='';return open();}if(action==='close')return dialog.close();
        if(action==='read-all'){markRead(items.map(i=>i.id));return render();}
        if(action==='snooze'){try{const item=items.find(i=>i.id===control.dataset.id);if(item)savePlan(p=>{p.features||=flowFeatureDefaults();p.features.reminders=p.features.reminders.filter(r=>r.id!==item.id);p.features.reminders.push({id:item.id,until:flowToday()});});}catch(error){statusText=error.message;render();}return;}
        if(busy)return;
        busy=true;statusText='';control.disabled=true;
        try{if(action==='enable')await enable();else if(action==='disable')await disable();else if(action==='test')await request({action:'test',subscription:subscription.toJSON()});statusText=action==='test'?'Test sent. Check your notifications.':action==='enable'?'Notifications are on.':'Notifications are off on this device.';}
        catch(error){statusText=error.message;}finally{busy=false;render();}
    });
    document.addEventListener('change',event=>{const key=event.target.dataset.notificationPreference;if(!['remindersEnabled','billReminders','budgetReminders'].includes(key))return;try{savePlan(p=>{p.preferences[key]=event.target.checked;});statusText='Saved.';}catch(error){statusText=error.message;render();}});
    for(const name of ['DOMContentLoaded','flow-auth-ready','flow-cloud-ready','flow-payday-rendered','flow-planning-updated','flow-budgets-updated','flow-transaction-updated','flow-transaction-data-updated','flow-accounts-updated'])document.addEventListener(name,schedule);
    window.addEventListener('storage',schedule);window.addEventListener('focus',schedule);window.addEventListener('hashchange',schedule);
    navigator.serviceWorker?.addEventListener('message',event=>{if(event.source?.scriptURL===new URL('sw.js',root).href&&event.data?.type==='FLOW_OPEN_NOTIFICATIONS'){requestedOpen=true;schedule();}});
    setInterval(()=>{const day=flowToday();if(day!==lastClock){lastClock=day;schedule();}},60000);
    window.FlowNotifications={open,beforeSignOut:disable};schedule();
})();

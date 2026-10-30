/* Private reminder inbox and opt-in Web Push. Opening Flow never prompts for permission. */
(function(){
    const demo=typeof flowDemoMode!=='undefined'&&flowDemoMode;
    const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const root=new URL(demo?'../':'./',location.href);
    let dialog,bell,owner=null,items=[],readIds=new Set(),server=null,subscription=null,busy=false,queued=false,lastClock='',statusText='',requestedOpen=false,view='inbox',introTimer;
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
        if(owner===expected){if(dialog?.open)render();else offerIntro();}
    }
    function preference(label,key,value){const wrap=make('label',undefined,'notification-preference');const input=make('input');input.type='checkbox';input.dataset.notificationPreference=key;input.checked=value;wrap.append(make('span',label),input);return wrap;}
    function render(){
        if(!dialog?.open)return;if(!owner||identity()!==owner){dialog.close();return;}
        const previousFocus=document.activeElement,focusKey=previousFocus?.dataset.notificationPreference;
        const body=dialog.querySelector('.notification-body');body.replaceChildren();
        const head=dialog.querySelector('.dialog-head');head.replaceChildren();
        dialog.classList.toggle('notification-welcome',view==='welcome');
        if(view==='settings'){const back=button('‹','open','icon-button');back.setAttribute('aria-label','Back to notifications');head.append(back);}
        const title=make('h2',view==='settings'?'Notification settings':view==='welcome'?'A little heads-up.':'Notifications');title.id='notification-title';head.append(title);
        if(view==='inbox'){const gear=button('','settings','icon-button');gear.setAttribute('aria-label','Notification settings');gear.innerHTML='<i data-lucide="settings-2" aria-hidden="true"></i>';head.append(gear);}
        const close=button('×','close','icon-button');close.setAttribute('aria-label','Close notifications');head.append(close);
        if(view==='welcome')renderWelcome(body);
        else if(view==='settings')renderSettings(body);
        else renderInbox(body);
        const status=make('p',statusText,'notification-status');status.setAttribute('role','status');body.append(status);
        for(const control of dialog.querySelectorAll('button,input'))control.disabled=busy;
        if(focusKey)body.querySelector('[data-notification-preference="'+focusKey+'"]')?.focus({preventScroll:true});
        else if(previousFocus&&!previousFocus.isConnected)close.focus({preventScroll:true});
        icons();
    }
    function renderInbox(body){
        const p=loadFlowPlanning(),enabled=p.preferences.remindersEnabled!==false;
        if(unread()){const tools=make('div',undefined,'notification-inbox-tools');tools.append(make('p','For you','notification-section-label'),button('Mark all read','read-all','inline-link'));body.append(tools);}
        if(!items.length){const empty=make('div',undefined,'notification-empty');empty.innerHTML='<i data-lucide="bell-check" aria-hidden="true"></i>';empty.append(make('h3',enabled?'You’re all caught up':'Reminders are paused'),make('p',enabled?'We’ll give you a heads-up when it matters.':'You can turn them on in settings.'));body.append(empty);}
        const list=make('div',undefined,'notification-list');
        for(const item of items){
            const row=make('article',undefined,'notification-row'+(!readIds.has(item.id)?' is-unread':''));
            const link=make('a',undefined,'notification-open');link.href=item.href;link.onclick=()=>{markRead([item.id]);dialog.close();};
            const symbol=make('span',undefined,'notification-symbol');symbol.innerHTML='<i data-lucide="'+(item.kind==='bill'?'calendar-days':'wallet')+'" aria-hidden="true"></i>';
            const copy=make('span',undefined,'notification-copy');copy.append(make('strong',item.title),make('span',item.text));
            const arrow=make('span','›','notification-chevron');arrow.setAttribute('aria-hidden','true');link.append(symbol,copy,arrow);
            const later=button('','snooze','notification-snooze');later.setAttribute('aria-label','Remind me tomorrow: '+item.title);later.dataset.id=item.id;later.innerHTML='<i data-lucide="clock-3" aria-hidden="true"></i>';
            row.append(link,later);list.append(row);
        }
        body.append(list);
        const footer=button('Notification settings','settings','notification-footer-link');body.append(footer);
    }
    function renderWelcome(body){
        const art=make('div',undefined,'notification-welcome-art');art.innerHTML='<i data-lucide="bell-ring" aria-hidden="true"></i><span class="notification-spark">✦</span>';body.append(art);
        body.append(make('p','Bills coming up. Budgets getting close. A helpful nudge, right when you need it.','notification-welcome-copy'));
        const benefits=make('div',undefined,'notification-benefits');
        for(const [symbol,label] of [['calendar-days','Stay ahead of bills'],['wallet','Keep spending on track']]){const row=make('div');row.innerHTML='<i data-lucide="'+symbol+'" aria-hidden="true"></i>';row.append(make('span',label));benefits.append(row);}body.append(benefits);
        body.append(button('Allow notifications','welcome-enable','save-button notification-allow'),button('Not now','not-now','notification-later'));
        body.append(make('p','Your amounts stay private. You’re in control.','notification-welcome-privacy'));
    }
    function renderSettings(body){
        const p=loadFlowPlanning(),on=subscription&&server?.subscribed,settings=make('div',undefined,'notification-settings');
        const phone=make('div',undefined,'notification-phone-settings');phone.append(make('h3','Push notifications'));
        let label;
        if(demo)label='Explore reminders here. Phone alerts are available in your own account.';
        else if(!supported()||isPhoneTab())label='Open Flow from your Home Screen to get phone alerts.';
        else if(Notification.permission==='denied')label='Blocked on this device. Allow Flow in your device’s notification settings.';
        else if(!server?.ready)label='Connect to check notification settings.';
        else label=on?'On for this device':'Off for this device';
        phone.append(make('p',label,'detail-help'));
        if(!demo&&supported()&&!isPhoneTab()&&Notification.permission!=='denied'&&server?.ready){phone.append(button(on?'Turn off':'Turn on',on?'disable':'enable',on?'back-button':'save-button'));}
        settings.append(phone,make('p','Remind me about','notification-section-label'),preference('Upcoming bills','billReminders',p.preferences.billReminders!==false),preference('Budget limits','budgetReminders',p.preferences.budgetReminders!==false),preference('Reminders in Flow','remindersEnabled',p.preferences.remindersEnabled!==false));
        settings.append(make('p','Quiet hours · 8 PM–9 AM','detail-help'),make('p','Balances and amounts stay off your lock screen.','detail-help'));
        if(on){const advanced=make('details',undefined,'notification-test');advanced.append(make('summary','Check delivery'),button('Send a test','test','back-button'));settings.append(advanced);}body.append(settings);
    }
    function introKey(){return 'flow-notification-onboarding:'+owner;}
    function rememberIntro(){try{flowStorage.setItem(introKey(),'done');}catch{}}
    function offerIntro(){
        clearTimeout(introTimer);
        let p,seen;try{p=loadFlowPlanning();seen=flowStorage.getItem(introKey())==='done';}catch{return;}
        const allowed=flowShouldOfferNotifications({demo,onHome:document.body.dataset.page==='home',setupComplete:p.setup.completed,
            remindersEnabled:p.preferences.remindersEnabled!==false,supported:supported()&&!isPhoneTab(),ready:server?.ready===true,
            permission:typeof Notification==='undefined'?'unsupported':Notification.permission,subscribed:Boolean(subscription&&server?.subscribed),seen});
        if(!allowed||document.hidden||document.querySelector('dialog[open]'))return;
        const expected=owner;
        introTimer=setTimeout(()=>{if(identity()!==expected||owner!==expected||document.hidden||document.querySelector('dialog[open]'))return;rememberIntro();open('welcome');},700);
    }
    function refresh(){
        queued=false;const next=identity();
        if(next!==owner){
            const previous=owner,previousSubscription=subscription;owner=next;server=null;items=[];subscription=null;readIds=new Set();statusText='';clearTimeout(introTimer);view='inbox';dialog?.close();
            if(previous&&!demo)previousSubscription?.unsubscribe().catch(()=>{});
            if(owner){try{const saved=JSON.parse(flowStorage.getItem(storageKey())||'[]');if(Array.isArray(saved))readIds=new Set(saved.filter(x=>typeof x==='string'));}catch{}deviceState();}
        }
        if(!bell){const toolbar=document.querySelector('.toolbar-actions');if(toolbar){bell=button('','open','notification-launch');bell.setAttribute('aria-haspopup','dialog');bell.innerHTML='<i data-lucide="bell" aria-hidden="true"></i><span class="notification-dot" hidden></span>';toolbar.insertBefore(bell,toolbar.querySelector('[data-open-account]'));icons();}}
        if(bell)bell.hidden=!owner;
        if(!owner)return;
        try{items=flowNotificationItems(getFlowSnapshot());}catch{items=[];}
        updateBell();render();
        if((location.hash==='#notifications'||location.hash==='#notification-settings'||requestedOpen)&&!dialog?.open){requestedOpen=false;open(location.hash==='#notification-settings'?'settings':'inbox');}else offerIntro();
    }
    function schedule(){if(!queued){queued=true;queueMicrotask(refresh);}}
    function open(nextView='inbox'){
        if(!owner)return;
        clearTimeout(introTimer);view=nextView;
        if(!dialog){
            dialog=make('dialog',undefined,'transaction-details-dialog notification-dialog');dialog.id='flow-notifications-dialog';dialog.setAttribute('aria-labelledby','notification-title');
            const head=make('div',undefined,'dialog-head');head.append(make('h2','Notifications'));head.firstChild.id='notification-title';const close=button('×','close','icon-button');close.setAttribute('aria-label','Close notifications');head.append(close);
            dialog.append(head,make('div',undefined,'notification-body'));document.body.append(dialog);
            dialog.addEventListener('close',()=>{if(view==='welcome')rememberIntro();if(['#notifications','#notification-settings'].includes(location.hash))history.replaceState(null,'',location.pathname+location.search);bell?.focus({preventScroll:true});});
            dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
        }
        if(!dialog.open)dialog.showModal();render();if(view!=='welcome')deviceState();
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
        if(action==='open'||action==='settings'){statusText='';return open(action==='settings'?'settings':'inbox');}if(action==='close'||action==='not-now'){if(view==='welcome')rememberIntro();return dialog.close();}
        if(action==='read-all'){markRead(items.map(i=>i.id));return render();}
        if(action==='snooze'){try{const item=items.find(i=>i.id===control.dataset.id);if(item)savePlan(p=>{p.features||=flowFeatureDefaults();p.features.reminders=p.features.reminders.filter(r=>r.id!==item.id);p.features.reminders.push({id:item.id,until:flowToday()});});}catch(error){statusText=error.message;render();}return;}
        if(busy)return;
        busy=true;statusText='';control.disabled=true;
        try{if(action==='enable'||action==='welcome-enable'){await enable();rememberIntro();if(action==='welcome-enable'){dialog.close();return;}}else if(action==='disable')await disable();else if(action==='test')await request({action:'test',subscription:subscription.toJSON()});statusText=action==='test'?'Test sent. Check your notifications.':action==='enable'?'Notifications are on.':'Notifications are off on this device.';}
        catch(error){statusText=error.message;if(action==='welcome-enable'&&Notification.permission!=='default'){rememberIntro();view='settings';}}finally{busy=false;render();}
    });
    document.addEventListener('change',event=>{const key=event.target.dataset.notificationPreference;if(!['remindersEnabled','billReminders','budgetReminders'].includes(key))return;try{savePlan(p=>{p.preferences[key]=event.target.checked;});statusText='Saved.';}catch(error){statusText=error.message;render();}});
    for(const name of ['DOMContentLoaded','flow-auth-ready','flow-cloud-ready','flow-payday-rendered','flow-planning-updated','flow-budgets-updated','flow-transaction-updated','flow-transaction-data-updated','flow-accounts-updated'])document.addEventListener(name,schedule);
    window.addEventListener('storage',schedule);window.addEventListener('focus',schedule);window.addEventListener('hashchange',schedule);
    navigator.serviceWorker?.addEventListener('message',event=>{if(event.source?.scriptURL===new URL('sw.js',root).href&&event.data?.type==='FLOW_OPEN_NOTIFICATIONS'){requestedOpen=true;schedule();}});
    setInterval(()=>{const day=flowToday();if(day!==lastClock){lastClock=day;schedule();}},60000);
    window.FlowNotifications={open,openSettings:()=>open('settings'),beforeSignOut:disable};schedule();
})();

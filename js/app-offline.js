/* Offline state and explicit app updates. Unsaved forms are never reloaded. */
(function(){
    let registration=null,requested=false;
    const appRoot=new URL(typeof flowDemoMode!=='undefined'&&flowDemoMode?'../':'./',location.href);
    function banner(){
        let node=document.querySelector('#flow-connectivity');if(!node){node=document.createElement('div');node.id='flow-connectivity';node.className='offline-banner';node.setAttribute('role','status');document.querySelector('.main')?.prepend(node);}
        node.hidden=navigator.onLine;node.textContent='Offline · edits stay on this device. Bank updates and cloud sync resume when you reconnect.';
    }
    function offerUpdate(){
        if(!registration?.waiting)return;
        let node=document.querySelector('#flow-app-update');if(node)return;
        node=document.createElement('div');node.id='flow-app-update';node.className='app-update-banner';node.setAttribute('role','status');
        const label=document.createElement('span');label.textContent='An updated Flow is ready.';
        const button=document.createElement('button');button.type='button';button.className='back-button';button.textContent='Update app';
        button.addEventListener('click',()=>{
            if(document.querySelector('dialog[open]')||typeof flowViewIsBeingEdited==='function'&&flowViewIsBeingEdited()){label.textContent='Finish or close your current form, then update from Home.';return;}
            requested=true;registration.waiting?.postMessage({type:'APPLY_FLOW_UPDATE'});
        });node.append(label,button);document.querySelector('.main')?.prepend(node);
    }
    document.addEventListener('DOMContentLoaded',async()=>{
        const skip=document.createElement('a');skip.href='#flow-main-content';skip.className='skip-link';skip.textContent='Skip to main content';document.body.prepend(skip);
        const main=document.querySelector('.main');if(main){main.id='flow-main-content';main.tabIndex=-1;}
        banner();
        if(!('serviceWorker'in navigator)||!window.isSecureContext)return;
        try{
            registration=await navigator.serviceWorker.register(new URL('sw.js',appRoot).href,{scope:appRoot.pathname,updateViaCache:'none'});offerUpdate();
            registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')offerUpdate();});});
            navigator.serviceWorker.addEventListener('controllerchange',()=>{if(requested)location.reload();});
        }catch(_){/* The online app still works when an offline copy cannot be prepared. */}
    });
    window.addEventListener('online',banner);window.addEventListener('offline',banner);
})();

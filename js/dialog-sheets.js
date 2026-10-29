/* Shared dialog scrolling and phone gestures. Never reads or writes account data. */
function createFlowDialogSheets(win, doc) {
    const phone = win.matchMedia('(max-width:768px)');
    const motion = win.matchMedia('(prefers-reduced-motion:reduce)');
    const root = doc.documentElement;
    let page, gesture, queued = false, order = [], settling;
    const openDialogs = () => [...doc.querySelectorAll('dialog[open]')];
    const topDialog = () => order.filter(d => d.open && d.isConnected).at(-1) || openDialogs().at(-1);
    function lockPage() {
        if (page) return;
        const body = doc.body, properties = ['position','top','left','width','overflow','padding-right'];
        page = { x:win.scrollX, y:win.scrollY, styles:properties.map(key => [key,body.style.getPropertyValue(key),body.style.getPropertyPriority(key)]) };
        const gap = Math.max(0, win.innerWidth - root.clientWidth);
        const padding = parseFloat(win.getComputedStyle(body).paddingRight) || 0;
        body.style.setProperty('position','fixed');
        body.style.setProperty('top',-page.y+'px');
        body.style.setProperty('left',-page.x+'px');
        body.style.setProperty('width','100%');
        body.style.setProperty('overflow','hidden');
        if (gap) body.style.setProperty('padding-right',padding+gap+'px');
        root.classList.add('flow-sheet-open');
    }
    function unlockPage() {
        if (!page) return;
        const previous = page; page = null;
        for (const [key,value,priority] of previous.styles) {
            if (value) doc.body.style.setProperty(key,value,priority);
            else doc.body.style.removeProperty(key);
        }
        root.classList.remove('flow-sheet-open');
        win.scrollTo({left:previous.x,top:previous.y,behavior:'instant'});
        // Native close/focus restoration can run after the open attribute changes.
        // Keep that last focus step from nudging the page away from its saved spot.
        win.requestAnimationFrame(()=>{
            if(!page)win.scrollTo({left:previous.x,top:previous.y,behavior:'instant'});
        });
    }
    function viewport() {
        if (gesture?.mode === 'drag' || settling) return;
        const view = win.visualViewport;
        root.style.setProperty('--flow-sheet-height',(view ? view.height*.94 : win.innerHeight*.94)+'px');
        root.style.setProperty('--flow-sheet-bottom',Math.max(0,view ? win.innerHeight-view.height-view.offsetTop : 0)+'px');
    }
    function resetDrag(dialog) {
        if (!dialog) return;
        dialog.classList.remove('flow-sheet-dragging','flow-sheet-settling');
        dialog.style.removeProperty('--flow-sheet-drag');
    }
    function requestClose(dialog) {
        // Preserve each form's cancel guard, including a bank recovery being saved.
        if (typeof dialog.requestClose === 'function') dialog.requestClose();
        else if (dialog.dispatchEvent(new win.Event('cancel',{cancelable:true}))) dialog.close();
    }
    function sync() {
        queued = false;
        const dialogs = openDialogs();
        order = order.filter(d => dialogs.includes(d));
        for (const dialog of dialogs) {
            if (!order.includes(dialog)) order.push(dialog);
            if (!dialog.querySelector(':scope > .flow-sheet-grip')) {
                const grip = doc.createElement('button');
                grip.type='button';grip.className='flow-sheet-grip';grip.setAttribute('aria-label','Close panel');
                dialog.prepend(grip);
            }
        }
        if (dialogs.length) lockPage(); else unlockPage();
        if (gesture && !dialogs.includes(gesture.dialog)) { resetDrag(gesture.dialog);gesture=null; }
        viewport();
    }
    function schedule() { if (!queued) { queued=true;win.queueMicrotask(sync); } }
    function beforeToggle(event) {
        if (event.target.tagName !== 'DIALOG') return;
        if (event.newState === 'open') {
            // Capture the page's position before native dialog focus can move it.
            lockPage();order=order.filter(d=>d!==event.target);order.push(event.target);
        }
        schedule();
    }
    function inside(dialog,x,y) {
        const r=dialog.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
    }
    function scrollable(target,dialog,dx,dy) {
        const horizontal=Math.abs(dx)>Math.abs(dy);
        for(let node=target;node;node=node.parentElement) {
            const css=win.getComputedStyle(node),position=horizontal?node.scrollLeft:node.scrollTop;
            const size=horizontal?node.scrollWidth-node.clientWidth:node.scrollHeight-node.clientHeight;
            const overflow=horizontal?css.overflowX:css.overflowY,delta=horizontal?dx:dy;
            if (/auto|scroll/.test(overflow)&&size>1&&(delta<0?position<size-1:position>1)) return true;
            if(node===dialog)break;
        }
        return false;
    }
    function start(event) {
        if (settling) return;
        if (!phone.matches || event.touches.length!==1) { if(gesture)resetDrag(gesture.dialog);gesture=null;return; }
        const dialog=topDialog();if(!dialog)return;
        const touch=event.touches[0],target=event.target;
        const grip=Boolean(target.closest?.('.flow-sheet-grip'));
        const within=dialog.contains(target)&&inside(dialog,touch.clientX,touch.clientY);
        const control=Boolean(target.closest?.('input,textarea,select,button,a,[contenteditable="true"],summary'))&&!grip;
        const atTop=dialog.scrollTop<=1&&!scrollable(target,dialog,0,1);
        gesture={dialog,target,x:touch.clientX,y:touch.clientY,lastY:touch.clientY,time:event.timeStamp,
            within,grip,eligible:within&&!control&&(grip||atTop),mode:null,distance:0};
    }
    function move(event) {
        if(!gesture||event.touches.length!==1)return;
        const g=gesture,touch=event.touches[0],dx=touch.clientX-g.x,dy=touch.clientY-g.y;
        if(topDialog()!==g.dialog){resetDrag(g.dialog);gesture=null;return;}
        if(!g.within){if(event.cancelable)event.preventDefault();return;}
        if(!g.mode&&Math.max(Math.abs(dx),Math.abs(dy))>6) {
            g.mode=g.eligible&&Math.abs(dy)>Math.abs(dx)*1.2&&(dy>0||g.grip)?'drag':'scroll';
        }
        if(g.mode==='drag') {
            if(event.cancelable)event.preventDefault();
            g.distance=Math.max(0,dy);g.dialog.classList.add('flow-sheet-dragging');
            g.dialog.style.setProperty('--flow-sheet-drag',g.distance+'px');
        } else if(!scrollable(g.target,g.dialog,touch.clientX-g.x,touch.clientY-g.lastY)&&event.cancelable) {
            // iOS can bounce a short dialog or its backdrop even with overflow hidden.
            // Contain only edge gestures; normal inner scrolling and inputs stay native.
            if(!g.target.closest?.('input,textarea,select,[contenteditable="true"]'))event.preventDefault();
        }
        g.lastY=touch.clientY;
    }
    function end(event) {
        const g=gesture;gesture=null;if(!g)return;
        if(g.mode!=='drag'){viewport();return;}
        const height=g.dialog.getBoundingClientRect().height;
        const velocity=g.distance/Math.max(1,event.timeStamp-g.time);
        const dismiss=event.type!=='touchcancel'&&(g.distance>=Math.max(70,Math.min(140,height*.25))||g.distance>30&&velocity>.55);
        g.dialog.classList.remove('flow-sheet-dragging');g.dialog.classList.add('flow-sheet-settling');
        g.dialog.style.setProperty('--flow-sheet-drag',dismiss?height+30+'px':'0px');
        win.clearTimeout(settling);
        settling=win.setTimeout(()=>{
            settling=null;
            if(dismiss&&g.dialog.open&&g.dialog===topDialog())requestClose(g.dialog);
            if(dismiss&&g.dialog.open) {
                g.dialog.style.setProperty('--flow-sheet-drag','0px');
                settling=win.setTimeout(()=>{settling=null;resetDrag(g.dialog);sync();},motion.matches?0:180);
                return;
            }
            resetDrag(g.dialog);sync();
        },motion.matches?0:180);
    }
    function click(event) {
        const grip=event.target.closest?.('.flow-sheet-grip');if(!grip)return;
        event.preventDefault();event.stopPropagation();requestClose(grip.closest('dialog'));
    }
    function viewportScroll() {
        // Ordinary page rubber-banding must not reposition the panel. Follow the
        // visual viewport while editing so the keyboard still leaves fields visible.
        if(doc.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]'))viewport();
    }
    const observer=new win.MutationObserver(schedule);
    observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
    doc.addEventListener('beforetoggle',beforeToggle,true);
    doc.addEventListener('close',schedule,true);
    doc.addEventListener('touchstart',start,{capture:true,passive:true});
    doc.addEventListener('touchmove',move,{capture:true,passive:false});
    doc.addEventListener('touchend',end,{capture:true,passive:true});
    doc.addEventListener('touchcancel',end,{capture:true,passive:true});
    doc.addEventListener('click',click,true);
    phone.addEventListener('change',viewport);
    win.addEventListener('resize',viewport);
    win.addEventListener('pageshow',sync);
    win.visualViewport?.addEventListener('resize',viewport);
    win.visualViewport?.addEventListener('scroll',viewportScroll);
    sync();
    return {refresh:sync};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createFlowDialogSheets};
if(typeof window!=='undefined'&&typeof document!=='undefined')window.FlowDialogSheets=createFlowDialogSheets(window,document);

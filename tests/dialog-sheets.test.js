const test=require('node:test'),assert=require('node:assert/strict');
const {createFlowDialogSheets}=require('../js/dialog-sheets.js');
function fixture(mobile=true){
    class Style{constructor(){this.values=new Map();}setProperty(k,v,p=''){this.values.set(k,[String(v),p]);}getPropertyValue(k){return this.values.get(k)?.[0]||'';}getPropertyPriority(k){return this.values.get(k)?.[1]||'';}removeProperty(k){this.values.delete(k);}}
    class Node extends EventTarget{
        constructor(tag='DIV'){super();this.tagName=tag;this.style=new Style();this.classes=new Set();this.classList={add:(...v)=>v.forEach(x=>this.classes.add(x)),remove:(...v)=>v.forEach(x=>this.classes.delete(x))};this.children=[];this.isConnected=true;this.scrollTop=0;this.scrollLeft=0;this.clientHeight=400;this.scrollHeight=1000;this.clientWidth=390;this.scrollWidth=390;this.open=false;this.closeCalls=0;}
        set className(v){this.classes=new Set(v.split(' '));}get className(){return [...this.classes].join(' ');}
        setAttribute(k,v){this[k]=v;}prepend(node){node.parentElement=this;this.children.unshift(node);}
        querySelector(){return this.children.find(x=>x.classes.has('flow-sheet-grip'))||null;}
        contains(node){for(let n=node;n;n=n.parentElement)if(n===this)return true;return false;}
        closest(selector){for(let n=this;n;n=n.parentElement){if(selector.includes('flow-sheet-grip')&&n.classes.has('flow-sheet-grip'))return n;if(selector==='dialog'&&n.tagName==='DIALOG')return n;if(selector.split(',').some(s=>s.trim().toUpperCase()===n.tagName))return n;}return null;}
        matches(selector){return Boolean(this.closest(selector)===this);}
        getBoundingClientRect(){return {left:0,right:390,top:100,bottom:500,height:400};}
        close(){this.open=false;this.closeCalls++;changed();}
        requestClose(){if(this.dispatchEvent(new Event('cancel',{cancelable:true})))this.close();}
    }
    const body=new Node('BODY'),root=new Node('HTML'),handlers=new Map(),dialogs=[],microtasks=[],frames=[],timers=new Map();let timerId=0,observe;
    const doc={body,documentElement:root,activeElement:body,querySelectorAll:()=>dialogs.filter(d=>d.open&&d.isConnected),createElement:tag=>new Node(tag.toUpperCase()),addEventListener:(type,fn)=>handlers.set(type,[...(handlers.get(type)||[]),fn])};
    const viewHandlers=new Map(),windowHandlers=new Map(),scrolls=[];
    const win={scrollX:0,scrollY:730,innerHeight:844,innerWidth:390,Event,
        matchMedia:q=>({matches:q.includes('max-width')?mobile:false,addEventListener(){}}),
        getComputedStyle:n=>({paddingRight:n.style.getPropertyValue('padding-right')||'0px',overflowY:n.style.getPropertyValue('overflow-y')||(n.tagName==='DIALOG'?'auto':'visible'),overflowX:n.style.getPropertyValue('overflow-x')||'visible'}),
        queueMicrotask:fn=>microtasks.push(fn),requestAnimationFrame:fn=>frames.push(fn),scrollTo:pos=>{scrolls.push(pos);win.scrollX=pos.left;win.scrollY=pos.top;},
        setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
        addEventListener:(type,fn)=>windowHandlers.set(type,fn),visualViewport:{height:844,offsetTop:0,addEventListener:(type,fn)=>viewHandlers.set(type,fn)},
        MutationObserver:class{constructor(fn){observe=fn;}observe(){}}
    };
    function flush(){while(microtasks.length)microtasks.shift()();}
    function changed(){observe?.();flush();}
    const app=createFlowDialogSheets(win,doc);
    function emit(type,target,values={}){const event={type,target,cancelable:true,timeStamp:values.timeStamp??10,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...values};for(const fn of handlers.get(type)||[])fn(event);if(!values.defer)flush();return event;}
    function dialog(){const d=new Node('DIALOG');d.parentElement=body;dialogs.push(d);return d;}
    function open(d){emit('beforetoggle',d,{newState:'open',defer:true});d.open=true;changed();return d;}
    function touch(type,target,x,y,time=10){return emit(type,target,{touches:type==='touchend'||type==='touchcancel'?[]:[{clientX:x,clientY:y}],timeStamp:time});}
    function settle(){const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());flush();}
    return {Node,app,doc,win,body,root,dialog,open,emit,touch,settle,changed,scrolls,viewHandlers,paint:()=>{while(frames.length)frames.shift()();}};
}
test('opening a sheet fixes the page before focus and restores its exact position and inline styles after closing',()=>{
    const x=fixture();x.body.style.setProperty('overflow','clip');x.body.style.setProperty('top','4px','important');
    const d=x.open(x.dialog());assert.equal(x.body.style.getPropertyValue('position'),'fixed');assert.equal(x.body.style.getPropertyValue('top'),'-730px');
    assert.ok(x.root.classes.has('flow-sheet-open'));x.win.scrollY=0;d.close();
    assert.equal(x.win.scrollY,730);assert.equal(x.body.style.getPropertyValue('position'),'');assert.equal(x.body.style.getPropertyValue('overflow'),'clip');assert.equal(x.body.style.getPropertyPriority('top'),'important');
});
test('newly inserted, replaced, stacked and removed dialogs retain the lock until the last one closes',()=>{
    const x=fixture(),first=x.open(x.dialog());const second=x.dialog();second.open=true;x.changed();
    first.close();assert.equal(x.body.style.getPropertyValue('position'),'fixed');assert.equal(x.scrolls.length,0);
    second.children=[];x.changed();assert.ok(second.querySelector('.flow-sheet-grip'));
    second.isConnected=false;x.changed();assert.equal(x.body.style.getPropertyValue('position'),'');assert.equal(x.scrolls.length,1);
});
test('late native focus restoration cannot nudge the page, and a newly opened panel cancels that correction',()=>{
    const x=fixture(),first=x.open(x.dialog());first.close();x.win.scrollY=685;x.paint();assert.equal(x.win.scrollY,730);
    x.open(first);first.close();x.win.scrollY=900;x.open(x.dialog());x.paint();assert.equal(x.win.scrollY,900);
});
test('a downward swipe follows the finger, closes only that sheet and restores the page',()=>{
    const x=fixture(),d=x.open(x.dialog()),grip=d.querySelector('.flow-sheet-grip');
    x.touch('touchstart',grip,190,115,0);const move=x.touch('touchmove',grip,194,230,120);
    assert.equal(move.prevented,true);assert.equal(d.style.getPropertyValue('--flow-sheet-drag'),'115px');assert.equal(d.open,true);
    x.touch('touchend',grip,194,230,180);assert.equal(d.open,true);x.settle();assert.equal(d.open,false);assert.equal(x.win.scrollY,730);
});
test('short or canceled pulls return the panel; normal scrolls and form controls never dismiss it',()=>{
    for(const kind of ['short','cancel','scroll','input']){
        const x=fixture(),d=x.open(x.dialog());let target=d;
        if(kind==='input'){target=new x.Node('INPUT');target.parentElement=d;}
        if(kind==='scroll')d.scrollTop=120;
        x.touch('touchstart',target,150,180,0);
        x.touch('touchmove',target,150,kind==='short'?200:310,300);
        x.touch(kind==='cancel'?'touchcancel':'touchend',target,150,310,700);x.settle();
        assert.equal(d.open,true,kind);assert.equal(d.closeCalls,0,kind);assert.equal(d.style.getPropertyValue('--flow-sheet-drag'),'');
    }
});
test('scrolling inside a panel or nested list remains native; the backdrop and lower edge cannot scroll the page',()=>{
    const x=fixture(),d=x.open(x.dialog()),nested=new x.Node();nested.parentElement=d;nested.style.setProperty('overflow-y','auto');nested.scrollTop=50;
    x.touch('touchstart',nested,150,250);assert.equal(x.touch('touchmove',nested,150,200).prevented,undefined);
    x.touch('touchend',nested,150,200);d.scrollTop=600;
    x.touch('touchstart',d,150,250);assert.equal(x.touch('touchmove',d,150,200).prevented,true);
    x.touch('touchend',d,150,200);
    x.touch('touchstart',d,150,40);assert.equal(x.touch('touchmove',d,150,10).prevented,true);
});
test('swipe and grip dismissal respect cancel guards while a protected save is running',()=>{
    const x=fixture(),d=x.open(x.dialog()),grip=d.querySelector('.flow-sheet-grip');d.addEventListener('cancel',event=>event.preventDefault());
    x.emit('click',grip);assert.equal(d.open,true);
    x.touch('touchstart',grip,190,115,0);x.touch('touchmove',grip,190,280,120);x.touch('touchend',grip,190,280,180);x.settle();
    assert.equal(d.open,true);assert.equal(x.body.style.getPropertyValue('position'),'fixed');
    assert.equal(d.style.getPropertyValue('--flow-sheet-drag'),'0px');x.settle();assert.equal(d.style.getPropertyValue('--flow-sheet-drag'),'');
});
test('ordinary visual viewport scroll cannot move the sheet; keyboard resizing still adjusts its available height',()=>{
    const x=fixture();x.open(x.dialog());const bottom=x.root.style.getPropertyValue('--flow-sheet-bottom');
    x.win.visualViewport.offsetTop=40;x.viewHandlers.get('scroll')();assert.equal(x.root.style.getPropertyValue('--flow-sheet-bottom'),bottom);
    x.win.visualViewport.height=500;x.viewHandlers.get('resize')();assert.equal(x.root.style.getPropertyValue('--flow-sheet-height'),'470px');
    const input=new x.Node('INPUT');x.doc.activeElement=input;x.win.visualViewport.offsetTop=80;x.viewHandlers.get('scroll')();assert.equal(x.root.style.getPropertyValue('--flow-sheet-bottom'),'264px');
});
test('desktop dialogs keep normal input behavior and never acquire touch dragging',()=>{
    const x=fixture(false),d=x.open(x.dialog());x.touch('touchstart',d,150,150);x.touch('touchmove',d,150,350);x.touch('touchend',d,150,350);x.settle();
    assert.equal(d.open,true);assert.equal(d.style.getPropertyValue('--flow-sheet-drag'),'');d.close();assert.equal(x.win.scrollY,730);
});

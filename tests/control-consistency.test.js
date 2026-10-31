const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('all app, login, offline and demo pages finish with the same control system',()=>{
 for(const folder of ['.','demo'])for(const file of fs.readdirSync(path.join(root,folder)).filter(f=>f.endsWith('.html'))){const html=read(path.join(folder,file)),styles=[...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m=>m[1]);assert.equal(styles.filter(s=>s.includes('css/controls.css')).length,1,file);assert.match(styles.at(-1),/css\/controls.css/);}
});
test('the shared stylesheet covers generated actions and React without styling navigation as save buttons',async()=>{
 const {JSDOM}=await import('jsdom'),dom=new JSDOM('<style>'+read('css/controls.css')+'</style><body class="app-redesign"><button class="save-button">Save</button><a class="inline-link" href="budgets.html">See purchases</a><button class="rb-delete inline-link">Delete</button><button class="icon-button">Close</button><a class="nav-link">Home</a></body>');
 const rules=[...dom.window.document.styleSheets[0].cssRules],declarations=[];
 const collect=list=>{for(const r of list){if(r.selectorText)declarations.push(r);if(r.cssRules)collect(r.cssRules);}};collect(rules);
 for(const selector of ['.save-button','.inline-link','.rb-delete','.icon-button']){const el=dom.window.document.querySelector(selector);assert.ok(declarations.some(r=>{try{return el.matches(r.selectorText)&&Boolean(r.style.getPropertyValue('border')||r.style.getPropertyValue('border-color'));}catch{return false;}}),selector+' needs a visible boundary');}
 assert.match(read('css/controls.css'),/--flow-control-height:\s*44px/);assert.match(read('css/controls.css'),/focus-visible/);assert.match(read('css/controls.css'),/prefers-reduced-motion/);assert.match(read('css/controls.css'),/aria-busy/);assert.doesNotMatch(read('css/controls.css'),/\.nav-link/);dom.window.close();
});
test('review labels are explicit while keeping the existing no-category-change and transfer behavior',async()=>{
 const {JSDOM}=await import('jsdom');
 const dom=new JSDOM(read('review.html'),{url:'https://sample.invalid/demo/review.html?scope=all',runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 for(const file of ['storage','planning-data','product-data','growth-data','bill-data','money-data','review-data','transaction-details-data'])w.eval(read('js/'+file+'.js'));
 const day=new Date().toISOString().slice(0,10),bank=(id,category)=>({id,name:'Mixed shop',amount:-10,type:'Expense',category,date:day,source:'bank',accountId:'account',bankConnectionId:'connection',reviewStatus:'needs-review'});
 const rows=[bank('one','Food'),bank('two','Shopping')];w.flowStorage.setItem('transactions',JSON.stringify(rows));
 w.eval(read('js/review.js'));
 const group=w.document.querySelector('.quick-review-group'),selects=group.querySelectorAll('select'),category=selects[1],type=selects[0],save=[...group.querySelectorAll('button')].find(b=>b.textContent==='Save 2 transactions');
 assert.ok(save);assert.equal(category.options[0].textContent,'Don’t change categories');assert.equal(category.value,'');
 type.value='Transfer';type.dispatchEvent(new w.Event('change'));assert.equal(category.disabled,true);assert.equal(category.options[0].textContent,'Not needed for transfers');
 type.value='Expense';type.dispatchEvent(new w.Event('change'));assert.equal(category.disabled,false);assert.equal(category.options[0].textContent,'Don’t change categories');
 save.click();const saved=JSON.parse(w.flowStorage.getItem('transactions'));assert.deepEqual(saved.map(t=>t.category),['Food','Shopping']);assert.ok(saved.every(t=>t.reviewStatus==='reviewed'));dom.window.close();
});

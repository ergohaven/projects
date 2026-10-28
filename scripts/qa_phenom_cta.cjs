const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PHENOM_PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.PHENOM_QA_OUT||path.resolve(__dirname,'../exports/phenom-qa');fs.mkdirSync(base,{recursive:true});const source=path.resolve(__dirname,'../assets/js/phenom-cta.js'),label='INTEGRATED';
const code=fs.readFileSync(source,'utf8'),sri='sha256-'+crypto.createHash('sha256').update(code).digest('base64');
(async()=>{const browser=await chromium.launch({...(process.env.PHENOM_CHROMIUM ? {executablePath:process.env.PHENOM_CHROMIUM} : {}),args:['--no-sandbox']});const rows=[];
try{for(const locale of ['en','ru'])for(const mode of ['desktop','mobile','canvas']){
 const page=await browser.newPage({viewport:mode==='desktop'?{width:1440,height:900}:{width:412,height:778},screen:mode==='desktop'?{width:1440,height:900}:{width:412,height:924},isMobile:mode!=='desktop',hasTouch:mode!=='desktop',deviceScaleFactor:mode==='desktop'?1:2.625,reducedMotion:'no-preference'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({canvas})=>{
  if(canvas&&top===self)new MutationObserver((_,o)=>{const m=document.querySelector('meta[name=viewport]');if(m){m.content='width=980';o.disconnect();}}).observe(document,{childList:true,subtree:true});
  const pending=new Set(),set=window.setTimeout,clear=window.clearTimeout;window.__ctaProbe={pending,paints:0};
  window.setTimeout=function(fn,ms,...args){let id;const ours=(new Error().stack||'').includes('phenom-cta.min.');id=set(()=>{pending.delete(id);fn(...args);},ms);if(ours)pending.add(id);return id;};window.clearTimeout=function(id){pending.delete(id);return clear(id);};
  const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.classList.contains('cta-terminal__raster'))window.__ctaProbe.paints++;return draw.apply(this,args);};
 },{canvas:mode==='canvas'});
 const row={locale,mode,checks:[],errors};const check=(name,ok,detail)=>{row.checks.push({name,pass:!!ok,detail});console.log(ok?'PASS':'FAIL',locale,mode,name,detail===undefined?'':JSON.stringify(detail));};
 await page.goto((process.env.PHENOM_QA_BASE||'http://127.0.0.1:1368')+`/${locale==='ru'?'ru/':''}phenom/`,{waitUntil:'load',timeout:90000});
 let doc=page;if(mode==='canvas'){await page.waitForSelector('iframe[data-phenom-desktop-canvas]');doc=await(await page.locator('iframe[data-phenom-desktop-canvas]').elementHandle()).contentFrame();}
 await doc.waitForSelector('#phenom-cta');await doc.evaluate(()=>document.fonts.ready);await page.waitForTimeout(400);
 const sample=()=>doc.evaluate(()=>({count:document.querySelectorAll('.cta-terminal').length,stages:[...document.querySelectorAll('.cta-terminal')].map(s=>({id:s.dataset.id,stage:s.dataset.stage,line:s.dataset.line||null,raster:s.dataset.raster||null,caption:s.querySelector('p').getAttribute('aria-label'),text:s.querySelector('span').textContent,opacity:+getComputedStyle(s.querySelector('p')).opacity,display:getComputedStyle(s).display,width:s.querySelector('canvas').width,height:s.querySelector('canvas').height,path:s.querySelector('path').getAttribute('d')})),timers:__ctaProbe.pending.size,paints:__ctaProbe.paints,innerHeight,innerWidth,scrollY,canvas:!!window.__phenomDesktopCanvas,owner:(()=>{const r=document.querySelector('#phenom-cta').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};})()}));
 row.initial=await sample();check('offscreen no CTA timers',row.initial.timers===0,row.initial);check('seven initialized tags',row.initial.count===7,row.initial.count);
 const go=async offset=>{const y=await doc.locator('#phenom-cta').evaluate(e=>e.getBoundingClientRect().top+scrollY);await page.evaluate(({y,canvas,offset})=>scrollTo({top:canvas?(y+offset)*document.documentElement.clientWidth/1440:y+offset,behavior:'instant'}),{y,canvas:mode==='canvas',offset});};
 await doc.evaluate(()=>{window.__ctaEntry=[];new MutationObserver(()=>{for(const s of document.querySelectorAll('.cta-terminal'))if(s.dataset.line&&!window.__ctaEntry.some(x=>x.id===s.dataset.id))window.__ctaEntry.push({id:s.dataset.id,stage:s.dataset.stage,line:s.dataset.line});}).observe(document.querySelector('#phenom-cta'),{subtree:true,attributes:true,attributeFilter:['data-stage','data-line']});});
 await go(-80);await page.waitForTimeout(2300);row.visible=await sample();
 if(mode==='mobile'){check('native mobile hidden',row.visible.stages.every(s=>s.display==='none'),row.visible);check('native mobile no timers',row.visible.timers===0);}
 else{
 check('seven visible raster line-tags',row.visible.stages.length===7&&row.visible.stages.every(s=>s.opacity===1&&s.raster==='ready'&&s.width>1),row.visible);
 const expected=locale==='ru'?['НАСТРАИВАЕМАЯ РАСКЛАДКА','ПОДКЛЮЧЕНИЕ USB TYPE-C','СМЕННЫЕ МОДУЛИ','ТРИ ФОРМ-ФАКТОРА','СПЛИТ-ФОРМАТ','ЕДИНАЯ ПЛАТФОРМА','ПОДСТРАИВАЕТСЯ ПОД ВАС']:['REMAPPABLE KEYS','USB TYPE-C CONNECTION','SWAPPABLE CONTROLS','THREE FORM FACTORS','SPLIT BY DESIGN','SINGLE PLATFORM','BUILT AROUND YOU'];
 check('exact seven localized captions',JSON.stringify(row.visible.stages.map(s=>s.caption))===JSON.stringify(expected));
 check('60 degree guides',row.visible.stages.length===7&&row.visible.stages.every(s=>{const n=s.path.match(/-?\d+(?:\.\d+)?/g).map(Number);return Math.abs(Math.abs((n[4]-n[1])/(n[3]-n[2]))-Math.sqrt(3))<1e-8;}));
 row.entry=await doc.evaluate(()=>window.__ctaEntry);check('each guide enters with its own acquiring tag',row.entry.length===7&&row.entry.every(s=>s.stage==='acquire'),row.entry);
 await page.waitForTimeout(250);check('idle retains raster cache',(await sample()).paints===row.visible.paints);
 await page.screenshot({path:path.join(base,`${label}-${locale}-${mode}.png`)});
 await go(-30);await page.waitForTimeout(250);row.smallScroll=await sample();check('scroll retains fixed raster cache',row.smallScroll.paints===row.visible.paints,{before:row.visible.paints,after:row.smallScroll.paints});
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(160);row.offscreen=await sample();check('outer scroll cancels timers',row.offscreen.timers===0,row.offscreen);
 // Visibility lifecycle seam, explicitly not physical OS tab backgrounding.
 await go(-80);await page.waitForTimeout(180);await doc.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(100);row.hidden=await sample();check('hidden document cancels timers',row.hidden.timers===0);
 await doc.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(150);check('foreground restarts visible timers',(await sample()).timers>0);
 }
 if(mode==='canvas'){
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(100);row.outerHidden=await sample();check('outer reading document hidden cancels timers',row.outerHidden.timers===0,row.outerHidden);
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(150);check('outer foreground resumes timers',(await sample()).timers>0);
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));await page.waitForTimeout(100);check('outer pagehide cancels timers',(await sample()).timers===0);
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.waitForTimeout(150);check('outer pageshow resumes timers',(await sample()).timers>0);
 }
 check('no browser errors',errors.length===0,errors);rows.push(row);fs.writeFileSync(path.join(base,`${label}-evidence.json`),JSON.stringify({source,sri,rows},null,2));await page.close();
 }}finally{await browser.close();}
 const checks=rows.flatMap(r=>r.checks);console.log('RESULT',checks.filter(c=>c.pass).length,'/',checks.length);process.exitCode=checks.every(c=>c.pass)?0:1;
})().catch(e=>{console.error(e);process.exitCode=1;});
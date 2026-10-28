const {chromium,setup,scroll,buttonStyles,out}=require('./phenom-qa-helpers.cjs');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{const b=await chromium.launch({...(process.env.PHENOM_CHROMIUM ? {executablePath:process.env.PHENOM_CHROMIUM} : {}),args:['--no-sandbox']});const rows=[];try{
for(const lang of ['ru','en'])for(const theme of ['light','dark'])for(const mode of ['desktop','mobile','canvas']){
 const {page,doc,errors}=await setup(b,lang,theme,mode,'no-preference');
 // Existing scroll cue and actual outer/native scroll, then all model/layer controls.
 await doc.locator('[data-phenom-scroll-cue]').click();await page.waitForTimeout(1100);
 assert(await page.evaluate(()=>scrollY>0),'Scroll cue changes the real scroll position');
 await scroll(page,doc,'[data-key-layout]',mode);await page.waitForTimeout(850);
 const models=await doc.locator('[data-key-layout-model-control]').evaluateAll(es=>es.map(e=>e.dataset.keyLayoutModelControl));let layers=0;
 for(const model of models){
  await doc.locator(`label[for="key-layout-model-${model}"]`).click();await page.waitForTimeout(180);
  const stage=doc.locator(`[data-key-layout-model-view="${model}"]`);assert.equal(await stage.getAttribute('hidden'),null);
  const tabs=stage.locator('[data-key-layout-layer-target]');
  for(let i=0;i<await tabs.count();i++){
   const tab=tabs.nth(i);await tab.click();await page.waitForTimeout(170);
   assert.equal(await tab.getAttribute('aria-selected'),'true');
   const id=await tab.getAttribute('aria-controls');const panel=doc.locator(`[id="${id}"]`);
   assert.equal(await panel.getAttribute('hidden'),null);
   assert(await panel.locator('img').evaluateAll(es=>es.some(e=>e.getBoundingClientRect().width>0&&e.naturalWidth>0)),'The active theme artwork must actually paint');layers++;
  }
  const first=tabs.first();await first.focus();await page.keyboard.press('End');await page.waitForTimeout(180);assert.equal(await tabs.last().getAttribute('aria-selected'),'true');
  await page.keyboard.press('Home');await page.waitForTimeout(180);assert.equal(await first.getAttribute('aria-selected'),'true');
 }
 // Entropy actually plays and advances; theme changes choose the other source.
 await scroll(page,doc,'#phenom-entropy',mode);await page.waitForTimeout(1200);
 const active=()=>doc.locator(`[data-theme-video="${theme}"]`);
 await active().evaluate(v=>v.play());const t=await active().evaluate(v=>v.currentTime);await page.waitForTimeout(450);assert(await active().evaluate(v=>!v.paused&&v.currentTime)>t);
 const opposite=theme==='light'?'dark':'light';await page.emulateMedia({colorScheme:opposite});await page.waitForTimeout(900);
 assert.equal(await doc.evaluate(()=>document.documentElement.dataset.theme),opposite);
 const other=doc.locator(`[data-theme-video="${opposite}"]`);await other.evaluate(v=>v.play());const t2=await other.evaluate(v=>v.currentTime);await page.waitForTimeout(450);assert(await other.evaluate(v=>!v.paused&&v.currentTime)>t2);
 assert(await active().evaluate(v=>v.paused));await page.emulateMedia({colorScheme:theme});
 // Focus names and both same-component fill interactions. Do not navigate away.
 const buttons=[];
 for(const section of ['phenom-entropy','phenom-cta']){
  const sel=`#${section} .phenom-action`;await scroll(page,doc,`#${section}`,mode);await page.waitForTimeout(850);
  const link=doc.locator(sel);const label=section==='phenom-entropy'?(lang==='ru'?'Подробнее':'Learn more'):(lang==='ru'?'Выбрать Phenom':'Choose your Phenom');
  assert.equal(await link.textContent(),label);assert.equal(await doc.getByRole('link',{name:label,exact:true}).count(),1);
  await link.focus();await page.waitForTimeout(200);
  const focus=await buttonStyles(doc,sel);assert.equal(focus.outlineStyle,'solid');assert.equal(focus.outlineWidth,'3px');
  assert.equal((await buttonStyles(doc,sel,'::before')).transform,'matrix(1, 0, 0, 1, 0, 0)');
  buttons.push({section,label,href:await link.getAttribute('href'),focus});
  await link.evaluate(e=>e.blur());await page.mouse.move(0,0);await page.waitForTimeout(180);
  if(mode==='desktop'){
   await link.hover();await page.waitForTimeout(60);const inflight=await buttonStyles(doc,sel,'::before');assert.notEqual(inflight.transform,'matrix(1, 0, 0, 1, 0, 0)','Real fill in flight');
   await page.waitForTimeout(180);assert.equal((await buttonStyles(doc,sel,'::before')).transform,'matrix(1, 0, 0, 1, 0, 0)');await page.mouse.move(0,0);
  }
 }
 assert.equal(buttons[0].focus.backgroundColor,buttons[1].focus.backgroundColor);
 // Back to top works in the outer canvas too, including re-entry after a jump.
 if(mode==='mobile'){
  assert.equal(await doc.locator('[data-phenom-back-to-top]').evaluate(e=>getComputedStyle(e).display),'none','Approved native-mobile control stays suppressed');
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 }else await doc.locator('[data-phenom-back-to-top]').click();
 await page.waitForFunction(()=>scrollY<2,null,{timeout:6000}).catch(async error=>{console.log('BACKTOP',lang,theme,mode,await page.evaluate(()=>({y:scrollY,active:document.activeElement?.outerHTML.slice(0,300)})));throw error;});
 await scroll(page,doc,'#phenom-finger-geometry',mode);await page.waitForTimeout(850);assert.equal(await doc.locator('#phenom-finger-geometry h2').evaluate(e=>getComputedStyle(e).opacity),'1');
 assert.deepEqual(errors,[]);rows.push({lang,theme,mode,models,layers,videoAdvancesBothThemes:true,anchorsAndRepeatedEntry:true,buttons,errors});fs.writeFileSync(out+'/interactions.json',JSON.stringify(rows,null,2));console.log('PASS interactions',lang,theme,mode,models.length,'models',layers,'layers');await page.close();
}
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

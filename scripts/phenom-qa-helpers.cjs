/* Actual-browser motion contracts and exact motion2 preservation baseline. */
const { chromium } = require(process.env.PHENOM_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const out = process.env.PHENOM_QA_OUT || require('node:path').resolve(__dirname,'../exports/phenom-qa');
const props = ['width','height','minHeight','padding','borderRadius','borderWidth','borderStyle','fontFamily','fontSize','fontWeight','letterSpacing','lineHeight','textTransform','backgroundColor','color','borderColor','transition','transform','outlineStyle','outlineWidth','outlineColor'];
const url = lang => (process.env.PHENOM_QA_BASE || 'http://127.0.0.1:1368') + (lang==='ru'?'/ru/phenom/':'/phenom/');
async function setup(browser, lang, theme, mode, reducedMotion = 'reduce', extra = {}, prepare) {
  const mobile = mode !== 'desktop';
  const options = { viewport: mobile ? { width:412,height:778 } : {width:1440,height:900}, screen:mobile ? {width:412,height:924}:{width:1440,height:900}, deviceScaleFactor:mobile?2.625:1, isMobile:mobile, hasTouch:mobile, colorScheme:theme, reducedMotion, ...extra };
  if(browser.browserType().name()==='firefox'){options.viewport=null;delete options.screen;delete options.deviceScaleFactor;delete options.isMobile;delete options.hasTouch;}
  const page=await browser.newPage(options);
  // Native/canvas routes retain the approved external font path. Allow its
  // real network request to finish rather than substituting a QA font route.
  page.setDefaultNavigationTimeout(90000);
  if(mode==='canvas') await page.addInitScript(() => {if(top===self)new MutationObserver((_,o)=>{const m=document.querySelector('meta[name=viewport]');if(m){m.content='width=980';o.disconnect();}}).observe(document,{childList:true,subtree:true});});
  if (prepare) await prepare(page);
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(url(lang),{waitUntil:'networkidle'}); assert.equal(response.status(),200);
  let doc=page;
  if(mode==='canvas'){await page.waitForSelector('iframe[data-phenom-desktop-canvas]');doc=await(await page.locator('iframe[data-phenom-desktop-canvas]').elementHandle()).contentFrame();await doc.waitForSelector('[data-phenom-tag]');}
  await doc.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(150);
  assert.equal(await doc.locator('.product-story--phenom>section').count(),12);
  return {page,doc,errors};
}
async function scroll(page,doc,selector,mode,offset=0){
 const y=await doc.locator(selector).evaluate(e=>e.getBoundingClientRect().top+scrollY);
 await page.evaluate(({y,canvas,offset})=>scrollTo({top:canvas?(y+offset)*document.documentElement.clientWidth/1440:y+offset,behavior:'instant'}),{y,canvas:mode==='canvas',offset});
}
async function signature(doc){return doc.evaluate(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return [r.x,r.y+scrollY,r.width,r.height];};
 const styles=e=>{const s=getComputedStyle(e);return [s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight,s.letterSpacing,s.color];};
 return {sections:[...document.querySelectorAll('.product-story--phenom>section')].map(e=>[e.id,...rect(e)]),texts:[...document.querySelectorAll('.product-story--phenom h1,.product-story--phenom h2,.visual-chapter__copy>p')].map(e=>[e.textContent,...styles(e),...rect(e)]),photos:[...document.querySelectorAll('.product-story--phenom img')].filter(e=>!e.closest('[hidden]')).map(e=>[e.getAttribute('alt'),e.currentSrc,...rect(e),getComputedStyle(e).objectFit,getComputedStyle(e).objectPosition,getComputedStyle(e).maskImage]),closing:[...document.querySelectorAll('#phenom-cta,#phenom-cta .visual-chapter__copy,#phenom-cta .visual-chapter__media,#phenom-cta img,#phenom-cta h2,#phenom-cta p')].map(e=>[e.className,...rect(e),getComputedStyle(e).maskImage]),links:[...document.querySelectorAll('a[href]')].map(e=>[e.getAttribute('href'),e.textContent.trim()])};
 });}
async function buttonStyles(doc,selector,pseudo){return doc.locator(selector).evaluate((e,{props,pseudo})=>{const s=getComputedStyle(e,pseudo);return Object.fromEntries(props.map(p=>[p,s[p]]));},{props,pseudo});}
module.exports = { setup, scroll, signature, buttonStyles, out, chromium, props };

// Desktop-site mode must use the desktop layout at a 980 CSS-pixel viewport,
// even when screen/touch still identify physical mobile hardware.
const {chromium}=require('../tmp/k04-quality-rework/qa/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const out=path.resolve(__dirname,'../exports/phenom-desktop-site-r1');fs.mkdirSync(out,{recursive:true});
const quick=process.argv.includes('--quick');
const baseline=process.argv.includes('--baseline');
const desktopUA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const phoneUA='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const profiles=[
 {name:'phone',w:390,h:844,screen:390,touch:true,mobile:true,ua:phoneUA,desktop:false},
 {name:'desktop-site-980',w:980,h:1740,screen:390,touch:true,mobile:true,ua:desktopUA,desktop:true},
 {name:'desktop-control-980',w:980,h:1740,screen:980,touch:false,mobile:false,ua:desktopUA,desktop:true},
 {name:'desktop-control-981',w:981,h:1740,screen:981,touch:false,mobile:false,ua:desktopUA,desktop:true},
 {name:'tablet-desktop-1024',w:1024,h:1366,screen:768,touch:true,mobile:true,ua:desktopUA,desktop:true},
 {name:'desktop-1440',w:1440,h:900,screen:1440,touch:false,mobile:false,ua:desktopUA,desktop:true},
 {name:'phone-landscape',w:844,h:390,screen:844,touch:true,mobile:true,ua:phoneUA,desktop:false},
 {name:'mobile-boundary-959',w:959,h:1366,screen:959,touch:true,mobile:true,ua:phoneUA,desktop:false}
];
(async()=>{const browser=await chromium.launch({executablePath:'/home/agent/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});const results=[],failures=[];
for(const profile of quick?profiles.slice(1,4):baseline?profiles.filter(p=>!p.name.includes('980')):profiles)for(const locale of quick?['ru']:['ru','en'])for(const theme of quick?['light']:['light','dark']){
 const p=await browser.newPage({viewport:{width:profile.w,height:profile.h},screen:{width:profile.screen,height:profile.h},isMobile:profile.mobile,hasTouch:profile.touch,userAgent:profile.ua});p.on('pageerror',e=>failures.push(`${profile.name}: ${e.message}`));await p.addInitScript(t=>localStorage.setItem('ergohaven-projects-theme',t),theme);
 await p.goto(`http://localhost:1314/${locale==='ru'?'ru/':''}phenom/`,{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);
 const actual=await p.evaluate(()=>{const read=e=>{const c=getComputedStyle(e),b=e.getBoundingClientRect();return{display:c.display,columns:c.gridTemplateColumns,x:b.x,w:b.width,h:b.height,font:c.fontSize}};return{width:innerWidth,screen:screen.width,touch:navigator.maxTouchPoints,viewport:document.querySelector('meta[name=viewport]').content,gallery:read(document.querySelector('.series-gallery')),hero:read(document.querySelector('.product-hero--immersive')),specs:read(document.querySelector('.specs-chapter__groups')),accordion:!!document.querySelector('.specs-chapter__groups--accordion'),mobileCopyHeight:document.querySelector('.key-layout-chapter').style.getPropertyValue('--phenom-layout-copy-height'),overflow:document.documentElement.scrollWidth-innerWidth};});
 const desktop=actual.gallery.columns.split(' ').length===3&&!actual.accordion;
 if(desktop!==profile.desktop)failures.push(`${profile.name} ${locale} ${theme}: expected ${profile.desktop?'desktop':'mobile'}, got gallery=${actual.gallery.columns}, accordion=${actual.accordion}`);
 if(profile.desktop&&actual.mobileCopyHeight)failures.push(`${profile.name}: mobile JS still active`);
 results.push({profile:profile.name,locale,theme,actual});fs.writeFileSync(path.join(out,quick?'repro.json':baseline?'baseline.json':'results.json'),JSON.stringify({results,failures},null,2));
 if(locale==='ru'&&theme==='light'&&['phone','desktop-site-980','desktop-1440'].includes(profile.name))await p.locator('.product-hero--immersive').screenshot({path:path.join(out,`${quick||baseline?'before':'after'}-${profile.name}.png`)});
 await p.close();
}await browser.close();console.log(JSON.stringify({cases:results.length,results:results.map(r=>({profile:r.profile,width:r.actual.width,screen:r.actual.screen,touch:r.actual.touch,columns:r.actual.gallery.columns,accordion:r.actual.accordion})),failures},null,2));assert.equal(failures.length,0,'Desktop-site must select desktop composition');})().catch(e=>{console.error(e);process.exit(1)});

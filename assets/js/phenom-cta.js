(() => {
 'use strict';
 // A full-height desktop iframe is not the reading viewport.
 const expanded=!!window.__phenomDesktopCanvas&&window.parent!==window;
 let readWindow=window,hostFrame=null;
 if(expanded){try{hostFrame=window.frameElement;void window.parent.document;readWindow=window.parent;}catch(_){return;}}
 const owner=document.querySelector('#phenom-cta'),photo=owner?.querySelector('img');if(!owner||!photo||owner.querySelector('.cta-terminal'))return;
 const ns='http://www.w3.org/2000/svg',glyphs='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*+-=?/';
 const ru=/^ru(?:-|$)/i.test(document.documentElement.lang);
 const defs=[
  {id:'keys',row:0,order:0,text:ru?'НАСТРАИВАЕМАЯ РАСКЛАДКА':'REMAPPABLE KEYS',left:true,p:[267,257,385,410,298]},
  {id:'usb',row:0,order:1,text:ru?'ПОДКЛЮЧЕНИЕ USB TYPE-C':'USB TYPE-C CONNECTION',left:true,p:[640,164,818,842,206]},
  {id:'controls',row:0,order:1,text:ru?'СМЕННЫЕ МОДУЛИ':'SWAPPABLE CONTROLS',left:true,p:[949,277,1088,1100,297]},
  {id:'formats',row:0,order:2,text:ru?'ТРИ ФОРМ-ФАКТОРА':'THREE FORM FACTORS',left:false,p:[1845,204,1705,1681,232]},
  {id:'split',row:1,order:0,text:ru?'СПЛИТ-ФОРМАТ':'SPLIT BY DESIGN',left:true,p:[152,584,299,329,559]},
  {id:'platform',row:1,order:1,text:ru?'ЕДИНАЯ ПЛАТФОРМА':'SINGLE PLATFORM',left:false,p:[1041,676,918,900,650]},
  {id:'fit',row:1,order:2,text:ru?'ПОДСТРАИВАЕТСЯ ПОД ВАС':'BUILT AROUND YOU',left:false,p:[1788,660,1647,1626,632]}
 ];
 const states=defs.map(d=>{
  const layer=document.createElement('aside');layer.className='cta-terminal';layer.dataset.id=d.id;layer.dataset.row=d.row;layer.dataset.stage='blank';
  const tag=document.createElement('p');tag.className='cta-terminal__label phenom-tag';tag.setAttribute('aria-label',d.text);
  const text=document.createElement('span');text.className='phenom-tag__visual cta-terminal__text';text.setAttribute('aria-hidden','true');text.textContent=d.text;tag.append(text);
  const svg=document.createElementNS(ns,'svg');svg.classList.add('cta-terminal__drawing');svg.setAttribute('aria-hidden','true');svg.setAttribute('shape-rendering','geometricPrecision');
  const path=document.createElementNS(ns,'path');path.classList.add('cta-terminal__line');
  const node=document.createElementNS(ns,'circle');node.classList.add('cta-terminal__node');node.setAttribute('r','2.2');const canvas=document.createElement('canvas');canvas.className='cta-terminal__raster';canvas.setAttribute('aria-hidden','true');canvas.width=canvas.height=1;svg.append(path,node);layer.append(svg,canvas,tag);owner.append(layer);
  return {...d,layer,tag,text,svg,path,node,canvas,paintKey:null,timer:0,active:false};
 });
 const wide=matchMedia('(min-width:981px)');let visible=false,leaving=false,frame=0;
 function inReadingViewport(){
  if(!owner.isConnected||!wide.matches)return false;
  const r=owner.getBoundingClientRect(),v=readWindow.visualViewport;
  const left=v?.offsetLeft||0,top=v?.offsetTop||0;
  const width=v?.width||readWindow.innerWidth,height=v?.height||readWindow.innerHeight;
  if(!r.width||!r.height)return false;
  if(!hostFrame)return r.left<left+width&&r.right>left&&r.top<top+height&&r.bottom>top;
  // Map iframe-local coordinates through its actual uniform transform.
  const f=hostFrame.getBoundingClientRect(),scale=f.width/hostFrame.offsetWidth;
  return scale>0&&f.left+r.left*scale<left+width&&f.left+r.right*scale>left&&
   f.top+r.top*scale<top+height&&f.top+r.bottom*scale>top;
 }
 const busy=()=>!!owner.querySelector('h2[data-phenom-reveal-pending],h2[data-phenom-heading-key],h2[data-phenom-rise-key],.visual-chapter__copy>p[data-phenom-rise-key]');
 const live=()=>visible&&wide.matches&&!document.hidden&&!readWindow.document.hidden&&!leaving&&!busy()&&photo.complete&&photo.naturalWidth>0;
 function stop(s){clearTimeout(s.timer);s.timer=0;s.active=false;s.layer.dataset.stage=s.introduced?'hold':'blank';s.text.textContent=s.textValue||s.tag.getAttribute('aria-label');s.text.classList.remove('is-glitch');if(!s.introduced){s.canvas.width=s.canvas.height=1;s.paintKey=null;delete s.layer.dataset.raster;}}
 function later(s,fn,ms){clearTimeout(s.timer);s.timer=setTimeout(()=>{s.timer=0;if(live()&&s.active)fn();else stop(s);},ms);}
 function burst(s,first){if(first)s.introduced=true;
  s.layer.dataset.stage=first?'acquire':'decode';s.text.classList.add('is-glitch');const start=performance.now(),duration=650+Math.random()*300,chars=[...s.textValue];
  const tick=()=>{const elapsed=performance.now()-start;if(elapsed>=duration){s.text.textContent=s.textValue;s.text.classList.remove('is-glitch');s.layer.dataset.stage='hold';later(s,()=>burst(s,false),3600+Math.random()*6500);return;}
   const p=Math.min(1,Math.max(0,(elapsed-120)/(duration-120))),resolved=Math.floor(chars.length*(1-Math.pow(1-p,1.5)));
   s.text.textContent=chars.map((c,i)=>c===' '||i<resolved?c:glyphs[Math.floor(Math.random()*glyphs.length)]).join('');later(s,tick,45+Math.random()*25);
  };tick();
 }
 states.forEach(s=>s.textValue=s.tag.getAttribute('aria-label'));
 let introStarted=false;const introTimers=new Set();
 function introLater(fn,delay){const id=setTimeout(()=>{introTimers.delete(id);if(live())fn();else refresh();},delay);introTimers.add(id);}
 function finishIntro(){introTimers.forEach(clearTimeout);introTimers.clear();states.forEach(s=>{s.introduced=true;s.layer.dataset.line='hold';stop(s);});}
 function refresh(){
  visible=inReadingViewport();
  if(!live()){if(introStarted)finishIntro();else states.forEach(stop);return;}
  geometry();
  if(!introStarted){
   introStarted=true;states.forEach(s=>s.active=true);
   states.forEach((s,i)=>introLater(()=>{s.layer.dataset.line='hold';burst(s,true);},100+i*130));
   return;
  }
  states.forEach(s=>{if(!s.active){s.active=true;s.introduced=true;s.layer.dataset.line='hold';s.layer.dataset.stage='hold';s.text.textContent=s.textValue;later(s,()=>burst(s,false),3600+Math.random()*6500);}});
 }

 const scratch=document.createElement('canvas');
 const nativeLines=new URLSearchParams(location.search).get('line-renderer')==='svg';
 function paintLine(s,p,o,dpr){
  if(nativeLines)return;
  const pad=4,left=Math.floor((Math.min(p.outer,p.bend,p.x)+o.left-pad)*dpr)/dpr-o.left,top=Math.floor((Math.min(p.rail,p.y)+o.top-pad)*dpr)/dpr-o.top;
  const right=Math.ceil((Math.max(p.outer,p.bend,p.x)+o.left+pad)*dpr)/dpr-o.left,bottom=Math.ceil((Math.max(p.rail,p.y)+o.top+pad)*dpr)/dpr-o.top;
  const width=right-left,height=bottom-top,key=[p.outer,p.rail,p.bend,p.x,p.y,left,top,dpr].join(',');if(s.paintKey===key)return;
  const sample=Math.max(8,dpr*2);scratch.width=Math.ceil(width*sample);scratch.height=Math.ceil(height*sample);
  const hi=scratch.getContext('2d');hi.scale(sample,sample);hi.translate(-left,-top);hi.strokeStyle='#746c72';hi.globalAlpha=.58;hi.lineWidth=1.7;hi.lineJoin='miter';hi.lineCap='butt';hi.beginPath();hi.moveTo(p.outer,p.rail);hi.lineTo(p.bend,p.rail);hi.lineTo(p.x,p.y);hi.stroke();hi.globalAlpha=.9;hi.fillStyle='#746c72';hi.beginPath();hi.arc(p.outer,p.rail,2.2,0,Math.PI*2);hi.fill();
  const c=s.canvas;c.width=Math.round(width*dpr);c.height=Math.round(height*dpr);c.style.left=left+'px';c.style.top=top+'px';c.style.width=width+'px';c.style.height=height+'px';const lo=c.getContext('2d');lo.imageSmoothingEnabled=true;lo.imageSmoothingQuality='high';lo.drawImage(scratch,0,0,c.width,c.height);s.paintKey=key;s.layer.dataset.raster='ready';
 }
 function geometry(){
  frame=0;if(!wide.matches||!photo.naturalWidth)return;
  const box=owner.getBoundingClientRect(),o={x:box.x+scrollX,y:box.y+scrollY,left:box.left+scrollX,top:box.top+scrollY,width:box.width,height:box.height},pr=photo.getBoundingClientRect(),r={x:pr.x+scrollX,y:pr.y+scrollY,width:pr.width,height:pr.height},k=Math.min(r.width/photo.naturalWidth,r.height/photo.naturalHeight),pw=photo.naturalWidth*k,ph=photo.naturalHeight*k,ix=r.x-o.x+(r.width-pw)/2,iy=r.y-o.y+(r.height-ph)/2;
  const project=(x,y)=>[ix+(x-42.22993973032044)/1895.5401205393591*pw,iy+(y+96.72598266601551)/1263.3599853515623*ph];
  const dpr=devicePixelRatio||1,offset=(Math.round(1.7*dpr)%2)/2;
  const snap=(v,origin)=>(Math.round((v+origin)*dpr-offset)+offset)/dpr-origin;
  states.forEach(s=>{
   let [outer,rail]=project(s.p[0],s.p[1]);let [bend]=project(s.p[2],s.p[1]);let [x,y]=project(s.p[3],s.p[4]);
   outer=snap(outer,o.x);bend=snap(bend,o.x);x=snap(x,o.x);rail=snap(rail,o.y);y=snap(y,o.y);
   const style=getComputedStyle(s.tag),font=parseFloat(style.fontSize),pad=parseFloat(style.paddingLeft),w=s.tag.getBoundingClientRect().width;
   bend=x-Math.sign(s.p[3]-s.p[2])*Math.abs(y-rail)/Math.sqrt(3);
   const length=w+font*1.2;
   outer=snap(bend+(s.left?-length:length),o.x);
   const edge=Math.max(s.left?font*.9:w+font*1.25,Math.min(o.width-font*.9-(s.left?w+font*.35:0),outer));
   const dx=snap(edge,o.x)-outer,dy=(s.row===0?-1:1)*Math.abs(dx)*.8;
   outer+=dx;bend+=dx;x+=dx;rail+=dy;y+=dy;
   const desired=s.left?outer+font*.35:outer-w-font*.35;const left=Math.max(font*.9,Math.min(o.width-font*.9-w,desired));
   s.tag.style.left=left+'px';s.tag.style.top=(rail-font*1.496)+'px';
   s.path.setAttribute('d',`M${outer} ${rail}H${bend}L${x} ${y}`);s.node.setAttribute('cx',outer);s.node.setAttribute('cy',rail);s.svg.setAttribute('viewBox',`0 0 ${o.width} ${o.height}`);if(live())paintLine(s,{outer,rail,bend,x,y},o,dpr);
  });scratch.width=scratch.height=1;
 }
 // Document-local raster keys stay fixed while the parent reading window scrolls.
 function requestGeometry(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;refresh();});}
 photo.addEventListener('load',requestGeometry);
 new ResizeObserver(requestGeometry).observe(owner);
 window.addEventListener('resize',requestGeometry,{passive:true});
 readWindow.addEventListener('scroll',requestGeometry,{passive:true});
 if(readWindow!==window)readWindow.addEventListener('resize',requestGeometry,{passive:true});
 readWindow.visualViewport?.addEventListener('resize',requestGeometry,{passive:true});
 readWindow.visualViewport?.addEventListener('scroll',requestGeometry,{passive:true});
 document.fonts?.ready.then(requestGeometry);
 // IO wakes the controller; the transformed outer reading rect decides eligibility.
 new IntersectionObserver(requestGeometry).observe(owner);
 new MutationObserver(refresh).observe(owner,{subtree:true,attributes:true,attributeFilter:['data-phenom-reveal-pending','data-phenom-heading-key','data-phenom-rise-key']});
 wide.addEventListener('change',requestGeometry);
 document.addEventListener('visibilitychange',refresh);
 if(readWindow!==window)readWindow.document.addEventListener('visibilitychange',refresh);
 const hide=()=>{leaving=true;refresh();},show=()=>{leaving=false;requestGeometry();};
 window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
 if(readWindow!==window){readWindow.addEventListener('pagehide',hide);readWindow.addEventListener('pageshow',show);}
 refresh();
})();

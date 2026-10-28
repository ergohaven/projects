(() => {
  'use strict';
  const group = document.querySelector('#phenom-entropy .chapter-media--theme-video');
  if (!group) return;
  const frame = document.createElement('span');
  frame.dataset.entropyFrame = ''; frame.setAttribute('aria-hidden', 'true'); frame.hidden = true;
  group.append(frame);
  let queued = 0;
  const update = () => {
    queued = 0;
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const video = group.querySelector(`video[data-theme-video="${theme}"]`);
    if (!video) { frame.hidden = true; return; }
    const box = video.getBoundingClientRect(), owner = group.getBoundingClientRect();
    if (!box.width || !box.height) { frame.hidden = true; return; }
    const values = {left:`${box.left-owner.left}px`,top:`${box.top-owner.top}px`,width:`${box.width}px`,height:`${box.height}px`,borderRadius:getComputedStyle(video).borderRadius};
    for (const [name,value] of Object.entries(values)) if (frame.style[name] !== value) frame.style[name] = value;
    frame.hidden = false;
  };
  const schedule = () => { if (!queued && !document.hidden) queued = requestAnimationFrame(update); };
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(schedule);observer.observe(group);group.querySelectorAll('video').forEach(video => observer.observe(video));
  }
  group.querySelectorAll('video').forEach(video => {for(const event of ['loadedmetadata','resize','loadeddata'])video.addEventListener(event,schedule);});
  new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(queued);queued=0;});
  window.addEventListener('pageshow',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  document.fonts.ready.then(schedule);schedule();
})();

const p=await browser.getPage('main');
await p.waitForSelector('[aria-label="Hide header"]',{timeout:15000});
await new Promise(r=>setTimeout(r,350));
console.log('MOBILE',JSON.stringify(await p.evaluate(()=>{
 const first=document.querySelector('[data-testid="thread-secondary-panel-top-chrome"]'),path=document.querySelector('[aria-label="Copy file path"]'),second=path.parentElement.parentElement;
 const tab=[...first.querySelectorAll('button')].find(e=>e.getAttribute('aria-pressed')==='true');const m=e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return {width:r.width,height:r.height,padding:c.padding,gap:c.gap,fontSize:c.fontSize,fontWeight:c.fontWeight,lineHeight:c.lineHeight}};
 return {host:m(first),note:m(second),tabText:m(tab),pathText:m(path),icons:[...second.querySelectorAll('svg')].map(e=>e.getBoundingClientRect().width),buttons:[...second.querySelectorAll('button')].filter(e=>e!==path).map(m),gapLabel:getComputedStyle(path.parentElement).gap,gapActions:getComputedStyle(second.lastElementChild).gap,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},overflow:document.documentElement.scrollWidth>innerWidth};
})));
await p.click('[aria-label="Note actions"]');await new Promise(r=>setTimeout(r,400));console.log('TOUCH MENU',(await p.snapshot()).split('\n').filter(l=>/menuitem|dialog|heading.*Note actions/.test(l)).join('\n'));
await p.keyboard.press('Escape');console.log('ERRORS',p._qaErrors);

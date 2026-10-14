const p=await browser.getPage("main");
const dir="/Users/brsbl/.bb/plugins/environment-git-worktree/host-data/worktrees/thr_sz2twxjkai-2/bb/.moss-viewer-evidence-ucyehod0";
await p.screenshot({path:dir+'/before-expanded-light-v2.png',type:'png'});
await p.click('[aria-label="Hide header"]');
const f=p.frames().find(f=>f.url().includes('/viewer/'));
console.log(await f.evaluate(()=>[...document.querySelectorAll('*')].filter(x=>x.scrollHeight>x.clientHeight+50&&getComputedStyle(x).overflowY!=='visible').map(x=>({tag:x.tagName,cls:x.className,height:x.clientHeight,scroll:x.scrollHeight}))));
console.log(await p.evaluate(()=>[...document.querySelectorAll('[aria-hidden]')].filter(e=>e.className==='absolute inset-x-0 top-0 z-10 h-3').map(e=>e.getBoundingClientRect().toJSON())));

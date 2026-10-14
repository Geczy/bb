const p=await browser.getPage('main');
p._qaErrors=[];p.on('pageerror',e=>p._qaErrors.push(String(e)));p.on('console',m=>{if(m.type()==='error')p._qaErrors.push(m.text())});
await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
console.log('Browser',await p.browser().version());
await p.goto('http://127.0.0.1:16439/projects/proj_dywaieptst/threads/thr_r5atxd23fj');
await p.waitForSelector('[aria-label="Thread actions"]');
console.log((await p.snapshot()).split('\n').filter(l=>/button.*(?:panel|setup|pane)/.test(l)).join('\n'));

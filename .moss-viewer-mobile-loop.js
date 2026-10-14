const p = await browser.getPage('main');
const tap = async (selector) => {
  const box = await (await p.$(selector)).boundingBox();
  await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
};
await tap('[aria-label="Close note actions"]');
await new Promise(r => setTimeout(r, 300));
const f = p.frames().find(frame => frame.url().includes('/viewer/'));
const before = await f.evaluate(() => {
  document.querySelector('.canvas-scroll').scrollTop = 370;
  const paragraph = [...document.querySelectorAll('p')].find(e => e.getBoundingClientRect().top > 20 && e.getBoundingClientRect().bottom < innerHeight);
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  const selection = getSelection();
  selection.removeAllRanges(); selection.addRange(range);
  window._mobileFrameSentinel = 'retained';
  return {scroll:document.querySelector('.canvas-scroll').scrollTop, selection:selection.toString()};
});
await tap('[aria-label="Note actions"][aria-haspopup="dialog"]');
await new Promise(r => setTimeout(r, 300));
await p.touchscreen.tap(100, 280);
await new Promise(r => setTimeout(r, 300));
console.log('RETENTION', {before,after:await f.evaluate(() => ({scroll:document.querySelector('.canvas-scroll').scrollTop,selection:getSelection().toString(),sentinel:window._mobileFrameSentinel}))});
console.log('DISMISSED',await p.evaluate(() => document.querySelector('[aria-label="Note actions"][aria-haspopup="dialog"]').getAttribute('aria-expanded')));
p._mobileShares=[];
p.on('request', request => { if(request.url().includes('/rpc/shareNote')) p._mobileShares.push(request.postData()); });
await tap('[aria-label="Note actions"][aria-haspopup="dialog"]');
await new Promise(r => setTimeout(r, 300));
const send = await p.evaluate(() => {
  const e=[...document.querySelectorAll('[data-persistent-drawer-content][data-state="open"] button')].find(e=>e.textContent.trim()==='Send to agent');
  const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};
});
await p.touchscreen.tap(send.x,send.y);
await new Promise(r => setTimeout(r, 400));
console.log('SHARED',p._mobileShares);
console.log('ERRORS',p._mobileErrors);
console.log((await p.snapshot()).split('\n').filter(l=>/mention|Send to agent|Note actions|Reading works|textbox/.test(l)).join('\n'));

const p=await browser.getPage('main');
const state=()=>p.evaluate(()=>{const row=document.querySelector('[aria-label="Copy file path"]').parentElement.parentElement;return {rowY:row.getBoundingClientRect().y,translate:getComputedStyle(row.parentElement).translate,stored:localStorage.getItem('moss-viewer:header-collapsed')}});
console.log('RELOAD SETTLED',await state());
await p.click('[aria-label="Show thread info panel"]');await new Promise(r=>setTimeout(r,300));
const tabLine=(await p.snapshot()).split('\n').find(l=>/button "Reading notes.md"/.test(l));await p.click('ref/'+tabLine.match(/\[ref=(.*?)\]/)[1]);
await new Promise(r=>setTimeout(r,700));console.log('CLIENT NAVIGATION',await state());
await p.mouse.move(750,52);await new Promise(r=>setTimeout(r,350));console.log('HOVER',await state());
await p.mouse.move(750,450);await new Promise(r=>setTimeout(r,650));console.log('LEAVE',await state());
await p.mouse.move(750,52);await new Promise(r=>setTimeout(r,350));
for(const theme of ['dark','light','system']){
 await p.evaluate(theme=>{localStorage.setItem('bb.theme',theme);window.dispatchEvent(new StorageEvent('storage',{key:'bb.theme',newValue:theme,storageArea:localStorage}))},theme);await new Promise(r=>setTimeout(r,400));
 console.log('THEME',theme,await p.evaluate(()=>({class:document.documentElement.className,bg:getComputedStyle(document.querySelector('[aria-label="Copy file path"]').parentElement.parentElement).backgroundColor})));
}
await p.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);await new Promise(r=>setTimeout(r,350));console.log('SYSTEM DARK',await p.evaluate(()=>document.documentElement.className));
await p.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);await new Promise(r=>setTimeout(r,350));console.log('SYSTEM LIGHT',await p.evaluate(()=>document.documentElement.className));
await p.click('[aria-label="Keep header shown"]');await p.mouse.move(600,500);await new Promise(r=>setTimeout(r,650));console.log('PINNED',await state());
console.log('ERRORS',p._qaErrors);

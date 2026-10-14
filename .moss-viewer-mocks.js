const p=await browser.getPage('mobile-options');
await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
const dir='/Users/brsbl/.bb/plugins/environment-git-worktree/host-data/worktrees/thr_sz2twxjkai-2/bb/.moss-viewer-evidence-ucyehod0';
for(const option of ['sheet','pinned']){
 await p.goto('http://127.0.0.1:16439/moss-mobile-options.html?option='+option);
 await p.screenshot({path:dir+'/mobile-option-'+option+'-v2.png',type:'png'});
 console.log(option,await p.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth})));
}

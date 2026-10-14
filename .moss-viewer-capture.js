const p=await browser.getPage("main");
await p.mouse.move(600,500);
await p.screenshot({path:"/Users/brsbl/.bb/plugins/environment-git-worktree/host-data/worktrees/thr_sz2twxjkai-2/bb/.moss-viewer-evidence-ucyehod0/before-expanded-light.png",type:"png"});
console.log(await p.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,theme:getComputedStyle(document.documentElement).getPropertyValue("--canvas")})));

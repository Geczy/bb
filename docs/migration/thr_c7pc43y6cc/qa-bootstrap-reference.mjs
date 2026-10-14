import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createConnection, migrate, installedPlugins } from '../packages/db/src/index.ts';
import { resolveDevInstanceConfig } from '../packages/config/src/runtime.ts';
import { listBundledPluginRegistrations } from '../apps/server/src/services/plugins/builtin-registry.ts';
const root = resolve('/root/.bb-machines/brsbl.getbb.app/plugins/environment-git-worktree/host-data/worktrees/thr_c7pc43y6cc-1/bb/.health-qa-Lsl7YL');
const config = resolveDevInstanceConfig({homeDir: join(root,'isolated-home'), repoRoot: resolve('.')});
mkdirSync(config.dataDir, {recursive:true});
const db = createConnection(join(config.dataDir,'bb.db'));
migrate(db);
const enabled = new Set(['provider-claude-code','thread-list','environment-project-checkout','environment-personal-workspace','custom-instructions']);
for (const p of listBundledPluginRegistrations()) {
 const pkg = JSON.parse(readFileSync(join(p.rootDir,'package.json'),'utf8'));
 db.insert(installedPlugins).values({id:p.pluginId,source:`builtin:${p.name}`,provenance:'builtin',sourceKind:'builtin',sourceBuiltinName:p.name,rootDir:p.rootDir,version:pkg.version,enabled:enabled.has(p.pluginId),enabledFollowsDefault:false,installedAt:Date.now(),updatedAt:Date.now()}).run();
}
writeFileSync(join(root,'instance.json'),JSON.stringify(config,null,2));
console.log(JSON.stringify(config));

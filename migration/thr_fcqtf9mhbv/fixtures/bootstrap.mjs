import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createConnection, migrate, installedPlugins } from '../packages/db/src/index.ts';
import { resolveDevInstanceConfig } from '../packages/config/src/runtime.ts';
import { listBundledPluginRegistrations } from '../apps/server/src/services/plugins/builtin-registry.ts';
const task = process.env.TASK_DIR;
const config = resolveDevInstanceConfig({ homeDir: join(task, 'home'), repoRoot: resolve('.') });
mkdirSync(config.dataDir, { recursive: true });
const db = createConnection(join(config.dataDir, 'bb.db'));
migrate(db);
const enabled = new Set(['provider-claude-code','thread-list','environment-project-checkout','environment-personal-workspace','custom-instructions']);
for (const p of listBundledPluginRegistrations()) {
 const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(join(p.rootDir,'package.json'),'utf8'));
 db.insert(installedPlugins).values({id:p.pluginId,source:`builtin:${p.name}`,provenance:'builtin',sourceKind:'builtin',sourceBuiltinName:p.name,rootDir:p.rootDir,version:pkg.version,enabled:enabled.has(p.pluginId),enabledFollowsDefault:false,installedAt:Date.now(),updatedAt:Date.now()}).run();
}
const instance = { ...config, taskDir: task };
writeFileSync(join(task,'instance.json'), JSON.stringify(instance,null,2));
console.log(JSON.stringify(instance));

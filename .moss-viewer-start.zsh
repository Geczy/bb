#!/bin/zsh
set -e
unset BB_CLI BB_CLI_REEXEC BB_THREAD_ID BB_PROJECT_ID BB_ENVIRONMENT_ID BB_THREAD_STORAGE BB_HOST_ID BB_AUTH_TOKEN
export NODE_ENV=development
export BB_DATA_DIR=/Users/brsbl/.bb/plugins/environment-git-worktree/host-data/worktrees/thr_sz2twxjkai-2/bb/.moss-viewer-data-68d02ltf
export BB_DEV_APP_PORT=16439
export BB_SERVER_PORT=24439
export BB_HOST_DAEMON_PORT=32439
export BB_SERVER_URL=http://127.0.0.1:24439
export BB_DEV_CONNECT_BASE_URL=http://bb.localhost:40439
export BB_TELEMETRY=false
pnpm install --frozen-lockfile
node scripts/ensure-native-modules.mjs
pnpm exec turbo run dev --filter=@bb/app --filter=@bb/server --filter=@bb/host-daemon --concurrency=20 --no-update-notifier

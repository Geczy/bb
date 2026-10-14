#!/bin/zsh
set -e
unset BB_CLI BB_CLI_REEXEC BB_THREAD_ID BB_PROJECT_ID BB_ENVIRONMENT_ID BB_THREAD_STORAGE BB_HOST_ID BB_AUTH_TOKEN
export BB_SERVER_URL=http://127.0.0.1:24439
export BB_HOST_DAEMON_PORT=32439
export BB_DATA_DIR=/Users/brsbl/.bb/plugins/environment-git-worktree/host-data/worktrees/thr_sz2twxjkai-2/bb/.moss-viewer-data-68d02ltf
export NODE_ENV=development
node --conditions=source --import tsx apps/cli/src/index.ts "$@"

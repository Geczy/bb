#!/usr/bin/env bash
set -euo pipefail
export HOME='/root/.bb-machines/brsbl.getbb.app/plugins/environment-git-worktree/host-data/worktrees/thr_fcqtf9mhbv-1/bb/.auth-recovery-qa-6Sm9LO/home'
export PATH='/root/.bb-machines/brsbl.getbb.app/plugins/environment-git-worktree/host-data/worktrees/thr_fcqtf9mhbv-1/bb/.auth-recovery-qa-6Sm9LO/bin':/usr/local/bin:/usr/bin:/bin
export CLAUDE_CONFIG_DIR='/root/.bb-machines/brsbl.getbb.app/plugins/environment-git-worktree/host-data/worktrees/thr_fcqtf9mhbv-1/bb/.auth-recovery-qa-6Sm9LO/default-profile'
export BB_CLAUDE_CODE_EXECUTABLE='/root/.bb-machines/brsbl.getbb.app/plugins/environment-git-worktree/host-data/worktrees/thr_fcqtf9mhbv-1/bb/.auth-recovery-qa-6Sm9LO/bin/claude'
export NODE_OPTIONS='--max-old-space-size=768'
export CI=1
export TURBO_TELEMETRY_DISABLED=1
unset BB_SERVER_URL BB_HOST_DAEMON_PORT BB_THREAD_ID BB_ENVIRONMENT_ID BB_THREAD_STORAGE BB_PROJECT_ID BB_CLI BB_CLI_REEXEC
cd '/root/.bb-machines/brsbl.getbb.app/plugins/environment-git-worktree/host-data/worktrees/thr_fcqtf9mhbv-1/bb'
exec pnpm dev

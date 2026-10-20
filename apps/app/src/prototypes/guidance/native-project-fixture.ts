import { z } from "zod";
import type { HostDiscoveredRepo } from "@bb/server-contract";

const historySchema = z.object({
  home: z.string().min(1),
  sessions: z.array(z.object({
    id: z.string().min(1),
    repoPath: z.string().min(1),
    startedAt: z.string().datetime(),
  })),
});

function readHistory() {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  try {
    const parsed = historySchema.safeParse(JSON.parse(localStorage.getItem("bb-guidance-project-history") ?? "null"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function guidanceProjectFixture(repos: readonly HostDiscoveredRepo[], now: number) {
  const history = readHistory();
  if (!history) return null;
  const sessionsByRepo = new Map<string, Set<string>>();
  for (const session of history.sessions) {
    const age = now - Date.parse(session.startedAt);
    if (age < 0 || age > 30 * 86_400_000) continue;
    const sessions = sessionsByRepo.get(session.repoPath) ?? new Set<string>();
    sessions.add(session.id);
    sessionsByRepo.set(session.repoPath, sessions);
  }
  const count = (path: string) => sessionsByRepo.get(path)?.size ?? 0;
  return {
    repos: [...repos].sort((left, right) => {
      const priority = Number(count(right.path) >= 3) - Number(count(left.path) >= 3);
      return priority || Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt);
    }),
    selected: new Set(repos.filter(repo => repo.projectId === null && count(repo.path) >= 3).map(repo => repo.path)),
    displayPath: (path: string) => path.startsWith(`${history.home}/`) ? `~/${path.slice(history.home.length + 1)}` : path,
  };
}

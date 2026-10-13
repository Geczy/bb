import { useCallback, useEffect, useRef, useState } from "react";
import { isPromptDraftEmpty } from "@bb/client-core";
import { useCreateProject } from "@/hooks/mutations/project-mutations";
import { usePromptDraftController } from "@/hooks/usePromptDraftStorage";
import { useImportedProjectDefault } from "@/lib/root-compose-selection";
import type { OnboardingEntry } from "./onboarding-telemetry";

export function useOnboardingProjectImport({
  entry,
  onContinue,
  onSettled,
}: {
  entry: OnboardingEntry;
  onContinue: () => void;
  onSettled: () => void;
}) {
  const createProject = useCreateProject();
  const setImportedProjectDefault = useImportedProjectDefault();
  const draft = usePromptDraftController({ kind: "new-thread" });
  const lifetimeRef = useRef<{ active: boolean; canSelect: boolean } | null>(
    null,
  );
  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false);

  useEffect(() => {
    const lifetime = {
      active: true,
      canSelect:
        entry === "first_run" && isPromptDraftEmpty(draft.getCurrent()),
    };
    lifetimeRef.current = lifetime;
    const checkDraft = () => {
      if (!isPromptDraftEmpty(draft.getCurrent())) lifetime.canSelect = false;
    };
    checkDraft();
    const unsubscribe = draft.subscribe(checkDraft);
    return () => {
      lifetime.active = false;
      unsubscribe();
    };
  }, [draft, entry]);

  const importProjects = useCallback(
    async (
      hostId: string,
      repos: readonly { name: string; path: string }[],
    ) => {
      const lifetime = lifetimeRef.current;
      if (importingRef.current || !lifetime?.active) return;
      importingRef.current = true;
      setImporting(true);
      let lastImportedProjectId: string | null = null;
      try {
        for (const repo of repos) {
          if (!lifetime.active) return;
          const project = await createProject.mutateAsync({
            name: repo.name,
            source: { type: "local_path", hostId, path: repo.path },
          });
          lastImportedProjectId = project.id;
        }
      } catch {
        return;
      } finally {
        importingRef.current = false;
        if (lifetime.active) {
          if (lifetime.canSelect && lastImportedProjectId !== null) {
            setImportedProjectDefault(lastImportedProjectId);
          }
          setImporting(false);
          onSettled();
        }
      }
      if (lifetime.active) onContinue();
    },
    [createProject, onContinue, onSettled, setImportedProjectDefault],
  );

  return { importing, importProjects };
}

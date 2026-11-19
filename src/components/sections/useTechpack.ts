import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "../ui";
import { updateProject, type Project } from "../../lib/db";
import { readTechpack, type SectionKey, type Techpack } from "../../model/techpack";

export type SaveState = "saved" | "saving" | "error";

/**
 * Holds the whole tech pack for one project and autosaves it (debounced) to local storage.
 * Mount it once per project so switching sections never loses unsaved edits.
 */
export function useTechpack(project: Project) {
  const [tp, setTp] = useState<Techpack>(() => readTechpack(project.techpack));
  const [state, setState] = useState<SaveState>("saved");
  const latest = useRef(tp);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const projectId = project.id;

  const save = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    const snapshot = latest.current;
    dirty.current = false;
    setState("saving");
    try {
      await updateProject(projectId, { techpack: snapshot });
      setState(dirty.current ? "saving" : "saved");
    } catch {
      dirty.current = true;
      setState("error");
      toast.error("Couldn't save your tech pack. Your edits are kept on screen; they'll retry on the next change.");
    }
  }, [projectId]);

  const replace = useCallback(
    (next: Techpack) => {
      latest.current = next;
      dirty.current = true;
      setTp(next);
      setState("saving");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void save(), 500);
    },
    [save],
  );

  const update = useCallback(<K extends SectionKey>(key: K, value: Techpack[K]) => replace({ ...latest.current, [key]: value }), [replace]);

  // Flush pending edits when the tab is hidden or closed, and when leaving the project.
  useEffect(() => {
    const flush = () => void save();
    const onHide = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [save]);

  return { tp, update, replace, state, retry: save };
}

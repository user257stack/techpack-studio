import { useCallback, useEffect, useState } from "react";
import { SECTIONS, type Section } from "../model/techpack";

export interface Route {
  projectId: string | null;
  section: Section;
}

// Hash routing (#/<project>/<section>) so the built site works on any static host with no server rules.
function parse(): Route {
  const [, projectId, section] = window.location.hash.split("/");
  return { projectId: projectId || null, section: (SECTIONS as readonly string[]).includes(section ?? "") ? (section as Section) : "mockups" };
}

export function useRoute(): [Route, (next: Partial<Route>) => void] {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = useCallback((next: Partial<Route>) => {
    const cur = parse();
    const projectId = next.projectId === undefined ? cur.projectId : next.projectId;
    const section = next.section ?? (next.projectId !== undefined ? "mockups" : cur.section);
    window.location.hash = projectId ? `#/${projectId}/${section}` : "";
    window.scrollTo({ top: 0 });
  }, []);
  return [route, go];
}

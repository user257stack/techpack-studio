import type { Project } from "../../lib/db";
import type { Section } from "../../model/techpack";
import { MockupGenerator } from "../generator/MockupGenerator";
import { ColorsSection, ConstructionSection, FabricsSection, FitSection, LabelsSection, SizingSection, type SectionProps } from "./sections";
import { SummarySection } from "./SummarySection";
import { SaveBadge } from "./ui";
import { useTechpack } from "./useTechpack";

/** One mounted instance per project; it owns the tech pack state so edits survive switching sections. */
export function ProjectView({ project, section, onGo, onOpenSettings }: { project: Project; section: Section; onGo: (s: Section) => void; onOpenSettings: () => void }) {
  const { tp, update, replace, state, retry } = useTechpack(project);
  const props: SectionProps = { project, tp, update, replace, badge: <SaveBadge state={state} onRetry={() => void retry()} /> };
  switch (section) {
    case "sizing": return <SizingSection {...props} onOpenSettings={onOpenSettings} />;
    case "fabrics": return <FabricsSection {...props} />;
    case "construction": return <ConstructionSection {...props} onGo={onGo} />;
    case "colors": return <ColorsSection {...props} />;
    case "labels": return <LabelsSection {...props} />;
    case "fit": return <FitSection {...props} />;
    case "summary": return <SummarySection {...props} onGo={onGo} />;
    default: return <MockupGenerator project={project} onOpenSettings={onOpenSettings} />;
  }
}

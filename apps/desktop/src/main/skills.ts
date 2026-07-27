import { getAgentDir, loadSkills } from "@earendil-works/pi-coding-agent";
import { piServices } from "./pi/services.ts";
import type { SkillInfo } from "../shared/pi-types.ts";

/**
 * The skills this project can invoke, as the composer's `$` menu sees them.
 *
 * Pi resolves `/skill:name` against exactly this set, so the list is read from
 * Pi's own loader rather than by walking the skill directories again — a menu
 * offering a name Pi cannot expand is worse than no menu.
 *
 * Skills that live in the project are local code the same way an extension is:
 * they are withheld until the folder is trusted, which is the same rule Pi
 * applies when it decides whether to load them at all.
 */
export async function listSkills(projectDir: string): Promise<SkillInfo[]> {
  const { pm, settings } = piServices(projectDir);
  const trusted = settings.isProjectTrusted();

  // Package skills are not part of `includeDefaults`; they arrive as explicit
  // paths. A package that fails to resolve should cost its own skills, not the
  // user and project ones that resolved fine.
  let packagePaths: string[] = [];
  try {
    packagePaths = (await pm.resolve()).skills.filter((skill) => skill.enabled).map((skill) => skill.path);
  } catch {
  }

  const { skills } = loadSkills({
    cwd: projectDir,
    agentDir: getAgentDir(),
    skillPaths: packagePaths,
    includeDefaults: true,
  });

  return skills
    .filter((skill) => trusted || skill.sourceInfo.scope !== "project")
    .map((skill): SkillInfo => ({
      name: skill.name,
      description: skill.description,
      scope: skill.sourceInfo.scope === "project" ? "project" : "user",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

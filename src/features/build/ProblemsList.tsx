// Clickable list of build problems (errors + warnings).

import { useAppStore } from "../../state/store";
import type { LogIssue } from "../../types";
import { isAbsoluteLike, joinPath, normalizeRelPath } from "../../utils/misc";

export function problemTargetPath(
  issue: LogIssue,
  projectRoot: string
): { path: string; line: number } | null {
  const raw = issue.file ? normalizeRelPath(issue.file) : "";
  if (raw.length === 0) return null;
  const abs = isAbsoluteLike(raw) ? raw : joinPath(projectRoot, raw);
  return { path: abs, line: issue.line ?? 1 };
}

function ProblemsList(): JSX.Element {
  const issues = useAppStore((s) => s.build.issues);
  const projectRoot = useAppStore((s) => s.projectRoot);
  const openFileAtLine = useAppStore((s) => s.openFileAtLine);

  if (issues.length === 0) {
    return <div className="output-placeholder">Nessun problema segnalato dall&apos;ultima compilazione.</div>;
  }

  return (
    <div>
      {issues.map((issue, i) => {
        const target = projectRoot ? problemTargetPath(issue, projectRoot) : null;
        const loc =
          issue.file
            ? `${normalizeRelPath(issue.file)}${issue.line != null ? `:${issue.line}` : ""}`
            : issue.line != null
              ? `riga ${issue.line}`
              : "";
        return (
          <div
            key={`${i}-${issue.message}`}
            className="problem-row"
            title={issue.message}
            onClick={() => {
              if (target) void openFileAtLine(target.path, target.line);
            }}
          >
            <span className={`problem-kind ${issue.kind}`}>{issue.kind === "error" ? "errore" : "avviso"}</span>
            {loc.length > 0 && <span className="problem-loc">{loc}</span>}
            <span className="problem-msg">{issue.message}</span>
          </div>
        );
      })}
    </div>
  );
}

export default ProblemsList;

/** Pannello inferiore: output di build e lista problemi (errori/warning). */
import { useEffect, useRef, useState } from 'react';
import { useBuildStore } from '../state/useBuildStore';
import { useEditorStore } from '../state/useEditorStore';
import type { Issue } from '../utils/ipc';

export function BuildPanel(): JSX.Element {
  const running = useBuildStore((s) => s.running);
  const phase = useBuildStore((s) => s.phase);
  const issues = useBuildStore((s) => s.issues);
  const durationMs = useBuildStore((s) => s.durationMs);
  const cancel = useBuildStore((s) => s.cancel);
  const clearOutput = useBuildStore((s) => s.clearOutput);
  const [tab, setTab] = useState<'output' | 'issues'>('output');

  const errCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.length - errCount;

  useEffect(() => {
    if (errCount > 0) setTab('issues');
  }, [errCount]);

  return (
    <section className="build-panel" aria-label="Build e problemi">
      <header className="build-header">
        <div className="build-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'output'}
            className={`build-tab${tab === 'output' ? ' on' : ''}`}
            onClick={() => setTab('output')}
          >
            Output
          </button>
          <button
            role="tab"
            aria-selected={tab === 'issues'}
            className={`build-tab${tab === 'issues' ? ' on' : ''}`}
            onClick={() => setTab('issues')}
          >
            Problemi
            {errCount > 0 && <span className="badge badge-err">{errCount}</span>}
            {warnCount > 0 && <span className="badge badge-warn">{warnCount}</span>}
          </button>
        </div>
        <div className="build-meta">
          {phase && (
            <span className={`build-phase${running ? ' running' : ''}`}>
              {running ? '● ' : ''}
              {phase}
              {durationMs != null && !running ? ` (${(durationMs / 1000).toFixed(1)} s)` : ''}
            </span>
          )}
          <button className="btn-mini" onClick={() => void clearOutput()} title="Svuota output">
            Svuota
          </button>
          {running && (
            <button className="btn-mini btn-danger" onClick={() => void cancel()} title="Annulla build">
              Interrompi
            </button>
          )}
        </div>
      </header>
      {tab === 'output' ? <OutputView /> : <IssuesView />}
    </section>
  );
}

function OutputView(): JSX.Element {
  const output = useBuildStore((s) => s.output);
  const running = useBuildStore((s) => s.running);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [output]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return (
    <div className="build-output" ref={scrollRef} onScroll={onScroll}>
      {output.length === 0 && (
        <div className="build-output-empty">{running ? 'In attesa di output…' : 'Nessun output.'}</div>
      )}
      {output.map((l, i) => (
        <div key={i} className="build-line">
          {l || '\u00a0'}
        </div>
      ))}
    </div>
  );
}

function IssuesView(): JSX.Element {
  const issues = useBuildStore((s) => s.issues);
  if (issues.length === 0) {
    return <div className="build-output build-output-empty">Nessun problema segnalato.</div>;
  }
  const ordered = [...issues.filter((i) => i.severity === 'error'), ...issues.filter((i) => i.severity === 'warning')];
  return (
    <div className="build-output issues">
      {ordered.map((issue, i) => {
        const clickable = issue.file != null && issue.line != null;
        return (
          <button
            key={i}
            className={`issue issue-${issue.severity}${clickable ? ' clickable' : ''}`}
            onClick={() => openIssue(issue)}
            title={clickable ? `Apri ${issue.file}:${issue.line}` : undefined}
            disabled={!clickable}
          >
            <span className={`issue-dot dot-${issue.severity}`} />
            <span className="issue-loc">
              {issue.file ?? '—'}
              {issue.line != null ? `:${issue.line}` : ''}
            </span>
            <span className="issue-msg">
              {issue.source ? `[${issue.source}] ` : ''}
              {issue.message}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function openIssue(issue: Issue): void {
  if (issue.file == null || issue.line == null) return;
  void useEditorStore.getState().openFileAtLine(issue.file, issue.line);
}

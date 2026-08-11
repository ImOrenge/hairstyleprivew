"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { ConsultationActiveTask } from "../../../lib/consulting/contracts";

function KineticGeometry({ kind }: { kind: ConsultationActiveTask["kind"] }) {
  if (kind === "analysis") return <>
    <ellipse cx="160" cy="120" rx="62" ry="82" /><path d="M112 97 Q160 63 208 97 M122 140 Q160 168 198 140 M160 38 V202" />
    {[[132,94],[188,94],[160,118],[137,145],[183,145],[112,120],[208,120],[160,60]].map(([cx,cy], index) => <circle key={index} cx={cx} cy={cy} r="4" style={{ "--kinetic-order": index } as CSSProperties} />)}
  </>;
  if (kind === "brief") return <>{[58,82,106,130,154,178].map((y, index) => <path key={y} d={`M74 ${y} H${index % 2 ? 236 : 210}`} style={{ "--kinetic-order": index } as CSSProperties} />)}<rect x="60" y="34" width="200" height="176" rx="3" /></>;
  if (kind === "aftercare-preparation") return <><path d="M45 122 H275" />{[55,110,165,220,270].map((cx, index) => <g key={cx} style={{ "--kinetic-order": index } as CSSProperties}><circle cx={cx} cy="122" r="12" /><path d={`M${cx} 76 V102 M${cx} 142 V172`} /></g>)}</>;
  return <>{Array.from({ length: 9 }, (_, index) => { const x = 58 + (index % 3) * 74; const y = 36 + Math.floor(index / 3) * 64; return <rect key={index} x={x} y={y} width="54" height="46" rx="2" style={{ "--kinetic-order": index } as CSSProperties} />; })}</>;
}

export function ConsultantKineticCanvas({ task, paused, partialVisible, onFidgetUse }: {
  task: ConsultationActiveTask;
  paused: boolean;
  partialVisible: boolean;
  onFidgetUse?: (count: number) => void;
}) {
  const [fidgetReadyTaskId, setFidgetReadyTaskId] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);
  const mayShowFidget = !paused && !partialVisible && !["failed", "complete", "cancelled"].includes(task.status);
  useEffect(() => {
    if (!mayShowFidget || fidgetReadyTaskId === task.id) return;
    const timer = window.setTimeout(() => setFidgetReadyTaskId(task.id), 5_000);
    return () => window.clearTimeout(timer);
  }, [fidgetReadyTaskId, mayShowFidget, task.id]);
  const fidgetReady = mayShowFidget && fidgetReadyTaskId === task.id;
  const mode = task.status === "complete" ? "complete" : task.status === "failed" ? "failed" : task.kind;
  return <div className="f-consultant-kinetic" data-kind={mode} data-paused={paused ? "true" : "false"} data-partial={partialVisible ? "true" : "false"}>
    <div className="f-consultant-kinetic__motion">
      <svg className="f-consultant-kinetic__canvas" viewBox="0 0 320 240" aria-hidden="true" focusable="false">
        <g><KineticGeometry kind={task.kind} /></g>
      </svg>
    </div>
    {fidgetReady ? <button type="button" className="f-consultant-kinetic__fidget" data-pulse={pulse % 2} onClick={() => setPulse((value) => {
      const next = value + 1;
      onFidgetUse?.(next);
      return next;
    })}>
      <span aria-hidden="true" />결과에 영향을 주지 않는 대기 인터랙션
    </button> : null}
  </div>;
}

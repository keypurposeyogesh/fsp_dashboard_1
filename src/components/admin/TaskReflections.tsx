"use client";
import { useAsync } from '@/lib/useAsync';
import { getTaskReflections } from '@/lib/data/challenge-community';
import { useState } from 'react';
export function TaskReflections({enrollmentId}:{enrollmentId:string}) {
  const [open,setOpen]=useState(false);
  const {data,error,loading,reload}=useAsync(()=>getTaskReflections(enrollmentId),[enrollmentId],open);
  return <details onToggle={event=>setOpen(event.currentTarget.open)} className="my-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4"><summary className="cursor-pointer text-xs font-semibold">Task reflections and member experiences</summary>
    {loading&&!data&&<p role="status" className="mt-3 text-xs">Loading reflections...</p>}
    {error&&<p role="alert" className="mt-3 text-xs">{error.kind==='unavailable'?'Reflection history setup is pending.':error.message}<button onClick={reload} className="ml-2 underline">Retry</button></p>}
    {data?.length===0&&<p className="mt-3 text-xs text-[var(--muted)]">No reflections submitted. Earlier completed tasks are preserved.</p>}
    <div className="mt-3 space-y-3">{data?.map(item=><article key={item.task_id} className="rounded-lg border border-[var(--card-border)] p-3"><h3 className="mb-2 text-xs font-bold">Day {item.day_number} - {item.task_title}</h3><p className="text-[10px] text-[var(--muted)]">{new Date(item.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST · {item.shared?'Shared with community':'Private to member and admins'}</p><h3 className="mt-2 text-xs font-semibold">Task explanation</h3><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed">{item.reflection}</p>{item.learning && <><h3 className="mt-3 text-xs font-semibold">Earlier learning note</h3><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed">{item.learning}</p></>}</article>)}</div>
  </details>;
}

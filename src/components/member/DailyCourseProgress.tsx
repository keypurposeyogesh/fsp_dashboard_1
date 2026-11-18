"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BookOpen } from "lucide-react";
import Link from "next/link";
import styles from "./LearningList.module.css";
import { createClient } from "@/lib/supabase/client";
import { useAsync } from "@/lib/useAsync";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { enrollmentError, courseAccessLabel, type OfferingEnrollment } from "@/lib/data/enrollments";
import { ProgramFlyer } from "./TodaysUpdates";
import { getTaskReflections } from "@/lib/data/challenge-community";
import { TaskCompletionForm, type CompletionReflection } from "./TaskCompletionForm";
import { notifyEnrollmentChanged } from "@/lib/enrollment-refresh";
import { useEnrollmentRefresh } from "@/lib/enrollment-refresh";

type Task = { id: string; offering_id: string; day_number: number; title: string; instructions: string };
type Completion = { enrollment_id: string; task_id: string };
async function loadProgress(memberId: string) {
  const db = createClient();
  const enrolled = await db.from("offering_enrollments").select("*, offerings!inner(*)").eq("member_id",memberId).eq("offerings.kind","course").order("created_at",{ascending:false});
  if (enrolled.error) throw enrolled.error;
  const enrollments = (enrolled.data as unknown as OfferingEnrollment[]).sort((a,b)=>Number(b.status === "active")-Number(a.status === "active"));
  const active = enrollments.filter(row=>row.status==="active");
  if (!active.length) return { enrollments, tasks: [] as Task[], completions: [] as Completion[] };
  const [tasks,completed] = await Promise.all([
    db.from("offering_daily_tasks").select("*").in("offering_id",active.map(row=>row.offering_id)).order("day_number"),
    db.from("offering_task_completions").select("enrollment_id,task_id").in("enrollment_id",active.map(row=>row.id)),
  ]);
  if (tasks.error) throw tasks.error;
  if (completed.error) throw completed.error;
  return { enrollments,tasks:tasks.data as Task[],completions:completed.data as Completion[] };
}

export function DailyCourseProgress({ memberId, compact = false }: { memberId: string | undefined; compact?: boolean }) {
  const { data,error,loading,reload,setData } = useAsync(()=>loadProgress(memberId!),[memberId],Boolean(memberId));
  const [selectedId,setSelectedId] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [actionError,setActionError] = useState("");
  useEnrollmentRefresh(reload, Boolean(memberId));
  const savingTask=useRef(false);
  async function done(enrollmentId: string,task: Task,reflection?:CompletionReflection):Promise<boolean> {
    if (busy || savingTask.current) return false;
    savingTask.current=true;
    setBusy(true); setMessage(""); setActionError("");
    try {
      const { data: result,error }=await createClient().rpc("complete_daily_task",{p_enrollment_id:enrollmentId,p_task_id:task.id,p_reflection:reflection?.reflection??null,p_share:reflection?.share??false});
      if (error) {
        if(error.code === "PGRST202") throw new Error("Task reflections are being set up. Please contact the FSP team and try again shortly.");
        throw error;
      }
      if (result?.task_id!==task.id) throw new Error("Progress could not be confirmed. Please refresh.");
      setData(previous=>previous ? {...previous,completions:[...previous.completions.filter(row=>!(row.enrollment_id===enrollmentId && row.task_id===task.id)),{enrollment_id:enrollmentId,task_id:task.id}]} : previous!);
      setMessage(task.day_number===30 ? "All 30 tasks completed. Check your reward balance below." : `Task ${task.day_number} saved. Your progress will not reset.`);
      reload();
      window.dispatchEvent(new Event("fsp-learning-changed"));
      notifyEnrollmentChanged();
      return true;
    } catch(err){setActionError(enrollmentError(err));return false;} finally{setBusy(false);savingTask.current=false;}
  }
  return <div className={compact ? styles.list : "space-y-4 border-t border-[var(--card-border)] pt-4"}>{!compact && <div className="flex items-center justify-between gap-3"><h3 className="font-bold">My Enrolled Courses</h3><Button variant="ghost" size="sm" disabled={loading || busy || !memberId} onClick={reload} data-action="refresh">Refresh</Button></div>}
    {compact && !memberId && <p className={styles.empty}>Your courses will appear here when your profile is ready.</p>}
    {loading && !data && <p role="status" className="text-sm">Loading your courses…</p>}{error && <p role="alert" className="text-sm text-[var(--danger)]">{error.kind==="unavailable" ? "Daily tasks need database setup. Please contact the FSP administrator." : error.message}</p>}{actionError && <p role="alert" className="text-sm text-[var(--danger)]">{actionError}</p>}{message && <p role="status" className="text-sm text-[var(--success)]">{message}</p>}
    {data?.enrollments.length===0 && (compact ? <div className={styles.empty}><BookOpen size={22}/><div><strong>A new chapter is waiting</strong><p>Choose a course and start building your skills.</p></div><Link href="/courses">Find a course <ArrowUpRight size={16}/></Link></div> : <p className="text-sm text-[var(--muted)]">Your enrolled courses and daily tasks will appear here.</p>)}
    {data?.enrollments.map(row=>{
      const tasks=data.tasks.filter(task=>task.offering_id===row.offering_id);
      const completed=new Set(data.completions.filter(record=>record.enrollment_id===row.id).map(record=>record.task_id));
      const count=tasks.filter(task=>completed.has(task.id)).length;
      const next = tasks.find(task=>!completed.has(task.id));
      if (compact) return <article key={row.id} className={styles.featured}>
        {row.offerings.flyer_path && <div className={styles.poster}><ProgramFlyer path={row.offerings.flyer_path} title={row.offerings.title}/></div>}
        <div className={styles.featureBody}>
          <div className={styles.featureHeading}><span className={styles.icon}><BookOpen size={23}/></span><div className={styles.copy}><strong>{row.offerings.title}</strong><span>{row.status === "active" ? "Your access is approved. Your challenge is active." : row.status === "access_denied" ? "Access declined. View your request for details." : "Waiting for administrator approval."}</span></div><div className={styles.headingActions}><Badge variant={row.status === "active" ? "success" : "warning"}>{courseAccessLabel(row.status)}</Badge>{row.status === "active" && next && row.offerings.code === "FSP-30DC" && <Button type="button" size="sm" disabled={busy || loading} onClick={()=>{setMessage("");setActionError("");setSelectedId(row.id);}}>Mark done</Button>}</div></div>
          {row.status === "active" && tasks.length > 0 && <><div className={styles.taskProgress}><progress value={count} max={tasks.length} aria-label={row.offerings.title + " progress"}/><span>{count}/{tasks.length} complete</span></div>{next ? <div className={styles.nextTask}><div><span className={styles.taskLabel}>UP NEXT - DAY {next.day_number}</span><h3>{next.title}</h3>{row.offerings.code !== "FSP-30DC" && <p>{next.instructions}</p>}</div>{row.offerings.code !== "FSP-30DC" && <Button size="sm" disabled={busy || loading} onClick={()=>void done(row.id,next)}>{busy ? "Saving..." : "Mark done"}</Button>}</div> : <p className={styles.finished}>All tasks completed. Well done!</p>}</>}
          {row.status === "active" && !tasks.length && <p className={styles.setupHint}>Your enrollment is active. The FSP team is preparing your tasks.</p>}
          <div className={styles.featureActions}>{row.status === "active" ? <button type="button" onClick={()=>{setMessage("");setActionError("");setSelectedId(row.id);}}>View all tasks <ArrowUpRight size={15}/></button> : <Link href="/courses">View access request<ArrowUpRight size={15}/></Link>}{row.status !== "active" && row.review_note && <span>Admin note: {row.review_note}</span>}</div>
        </div>
      </article>;
      return <button type="button" key={row.id} onClick={()=>{setMessage("");setActionError("");setSelectedId(row.id);}} className="block w-full rounded-xl border border-[var(--card-border)] p-4 text-left transition-colors hover:bg-[var(--muted-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-navy)]">
        <span className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{row.offerings.title}</span><Badge variant={row.status==="active" ? "success" : "warning"}>{courseAccessLabel(row.status)}</Badge></span>
        <span className="mt-2 block text-xs text-[var(--muted)]">{tasks.length ? `${count}/${tasks.length} days complete · ${count===tasks.length ? "View completed tasks" : "Open daily tasks"}` : "View course details"} →</span>
      </button>;
    })}
    {data && selectedId && (()=>{
      const row=data.enrollments.find(item=>item.id===selectedId);
      if (!row) return null;
      return <DailyTaskDialog key={row.id} row={row} tasks={data.tasks.filter(task=>task.offering_id===row.offering_id)} completions={data.completions.filter(record=>record.enrollment_id===row.id)} busy={busy} message={message} error={actionError} onDone={done} onClose={()=>setSelectedId(null)}/>;
    })()}
  </div>;
}

function DailyTaskDialog({row,tasks,completions,busy,message,error,onDone,onClose}:{row:OfferingEnrollment;tasks:Task[];completions:Completion[];busy:boolean;message:string;error:string;onDone:(enrollmentId:string,task:Task,reflection?:CompletionReflection)=>Promise<boolean>;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [viewedTask,setViewedTask]=useState<string | null>(null);
  const history=useAsync(()=>getTaskReflections(row.id),[row.id],row.offerings.code === "FSP-30DC" && row.status === "active");
  useEnrollmentRefresh(history.reload,row.offerings.code === "FSP-30DC");
  const completed=new Set(completions.map(item=>item.task_id));
  const next=tasks.find(task=>!completed.has(task.id));
  const selected=tasks.find(task=>task.id===viewedTask) ?? next;
  const selectedReflection=history.data?.find(item=>item.task_id===selected?.id);
  const count=tasks.filter(task=>completed.has(task.id)).length;
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} aria-labelledby="daily-task-title" onCancel={event=>{if(busy)event.preventDefault();else onClose();}} className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-6 text-[var(--foreground)] shadow-xl backdrop:bg-black/50">
    <div className="space-y-5"><div className="flex items-start justify-between gap-4"><div><h2 id="daily-task-title" className="text-xl font-bold">{row.offerings.title}</h2><p className="mt-1 text-sm text-[var(--muted)]">Daily tasks and saved progress</p></div><Button type="button" size="sm" variant="outline" disabled={busy} onClick={onClose}>Close</Button></div>
      <p className="text-sm leading-relaxed">{row.offerings.description}</p>
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}{message && <p role="status" className="text-sm text-[var(--success)]">{message}</p>}
      {row.status!=="active" ? <p className="text-sm">Daily tasks unlock after administrator approval.</p> : !tasks.length ? <p className="text-sm">Daily tasks are not configured for this course yet.</p> : <>
        <p className="text-sm font-semibold">{count} of {tasks.length} days completed</p><progress value={count} max={tasks.length} aria-label="Course progress" className="h-2 w-full accent-[var(--brand-navy)]"/>
        {selected ? <div className="space-y-3 rounded-xl bg-[var(--muted-light)] p-4"><Badge variant={completed.has(selected.id)?"success":"secondary"}>Day {selected.day_number}{completed.has(selected.id)?" · Done":""}</Badge><h3 className="font-bold">{selected.title}</h3><p className="whitespace-pre-wrap text-sm leading-relaxed">{selected.instructions}</p>{completed.has(selected.id) && row.offerings.code === "FSP-30DC" && <div className="space-y-2 border-t border-[var(--card-border)] pt-3">{selectedReflection ? <><h4 className="text-xs font-bold">Your task explanation</h4><p className="whitespace-pre-wrap text-sm">{selectedReflection.reflection}</p>{selectedReflection.learning && <><h4 className="text-xs font-bold">Earlier learning note</h4><p className="whitespace-pre-wrap text-sm">{selectedReflection.learning}</p></>}<p className="text-xs text-[var(--muted)]">{selectedReflection.shared?"Shared in Challenge Community":"Private to you and admins"}</p></> : <p className="text-xs text-[var(--muted)]">{history.loading?"Loading your reflection...":history.error?"Reflection history could not be loaded.":"No reflection recorded for this earlier completion."}</p>}</div>}{selected.id===next?.id && (row.offerings.code === "FSP-30DC" ? <TaskCompletionForm key={selected.id} busy={busy} onSubmit={async value=>{const saved=await onDone(row.id,selected,value);if(saved)onClose();return saved;}}/> : <Button type="button" size="sm" disabled={busy} onClick={()=>{setViewedTask(null);void onDone(row.id,selected);}}>{busy?"Saving...":"Done - next task"}</Button>)}</div> : <p className="font-semibold text-[var(--success)]">All course tasks completed!</p>}
        <details><summary className="cursor-pointer text-sm font-semibold">Choose a day</summary><div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6">{tasks.map(task=><Button type="button" key={task.id} size="sm" variant={task.id===selected?.id?"primary":"outline"} disabled={busy || (!completed.has(task.id) && task.id!==next?.id)} onClick={()=>setViewedTask(task.id)} aria-label={`Day ${task.day_number}${completed.has(task.id)?", completed":""}`}>{task.day_number}{completed.has(task.id)?" ✓":""}</Button>)}</div></details>
      </>}
    </div>
  </dialog>;
}

"use client";
import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock3, Users, ListChecks, Search, ChevronDown } from 'lucide-react';
import { useAsync } from '@/lib/useAsync';
import { useEnrollmentRefresh } from '@/lib/enrollment-refresh';
import { getAdminTaskProgress } from '@/lib/data/task-progress';
import { ErrorState, LoadingState } from '@/components/ui/States';
import styles from './progress.module.css';
import { TaskReflections } from '@/components/admin/TaskReflections';
import { ChallengeDiscount } from '@/components/admin/ChallengeDiscount';

const labels: Record<string,string> = { completed:'Completed', in_progress:'In progress', not_started:'Not started', unconfigured:'Tasks not configured' };
const date = (value: string) => new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(value));
export default function TaskProgressPage() {
  const { data, error, loading, reload } = useAsync(getAdminTaskProgress);
  useEnrollmentRefresh(reload);
  const [search,setSearch] = useState('');
  const [course,setCourse] = useState('');
  const [status,setStatus] = useState('');
  const rows = data ?? [];
  const filtered = rows.filter(row => (!course || row.offering_id === course) && (!status || row.status === status) && `${row.name} ${row.email} ${row.offerings.title}`.toLowerCase().includes(search.trim().toLowerCase()));
  const courses = [...new Map(rows.map(row=>[row.offering_id,row.offerings.title])).entries()];
  const stats = [
    { label:'Active learners', value:new Set(rows.map(row=>row.member_id)).size, Icon:Users },
    { label:'Tasks completed', value:rows.reduce((sum,row)=>sum+row.completed,0), Icon:ListChecks },
    { label:'Challenges completed', value:rows.filter(row=>row.status==='completed').length, Icon:CheckCircle2 },
    { label:'Yet to start', value:rows.filter(row=>row.status==='not_started').length, Icon:Clock3 },
  ];
  return <div className={styles.page}><header className={styles.heading}><div><p>TASKS & CHALLENGES</p><h1>Member task progress</h1><span>See who is learning, what they have completed, and their next task.</span></div><button onClick={reload} disabled={loading} data-action="refresh">{loading?'Refreshing…':'Refresh'}</button></header>
    {error && <ErrorState error={error} onRetry={reload}/>}
    {rows.some(row=>row.rewardSetupPending) && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs">Task progress is available. Reward balances need migration 022_challenge_rewards.sql applied in Supabase before discounts can be recorded.</p>}
    {loading && !data ? <LoadingState label="Loading member task progress"/> : data && <>
      <div className={styles.stats}>{stats.map(({label,value,Icon})=><div key={label}><Icon size={23}/><div><strong>{value}</strong><span>{label}</span></div></div>)}</div>
      <section className={styles.panel} aria-label="Member challenge progress"><div className={styles.filters}><label className={styles.search}><Search size={16}/><input aria-label="Search members" placeholder="Search member, email or challenge…" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Filter by challenge" value={course} onChange={e=>setCourse(e.target.value)}><option value="">All challenges</option>{courses.map(([id,title])=><option key={id} value={id}>{title}</option>)}</select><select aria-label="Filter by progress" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All progress</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
      <p className={styles.count}>{filtered.length} enrollment{filtered.length===1?'':'s'} · Latest activity first · Times in IST</p>
      {!filtered.length && <div className={styles.empty}>{rows.length?'No members match these filters.':'No active course enrollments yet. Members appear here after enrollment activation.'}</div>}
      {filtered.map(row=><details key={row.id} className={styles.row}><summary><div className={styles.person}><span className={styles.avatar}>{row.name.slice(0,1).toUpperCase()}</span><div><strong>{row.name}</strong><span>{row.email}</span></div></div><div className={styles.course}><strong>{row.offerings.title}</strong><span>{row.latest ? `Last completed ${date(row.latest)}` : 'No tasks completed yet'}</span></div><div className={styles.progress}><span>{row.reward ? `${row.reward.available_points} redeemable points ? ` : ""}{row.completed} / {row.total} tasks · {row.percent}%</span><progress max={100} value={row.percent} aria-label={`${row.name} challenge progress`}/></div><span className={row.status==='completed'?styles.complete:styles.status}>{labels[row.status]}</span><ChevronDown size={16}/></summary>
        <div className={styles.detail}><div className={styles.detailHeading}><h2>Task completion history</h2><Link href={`/admin/members/${row.member_id}`}>Member profile →</Link></div>{row.reward && <ChallengeDiscount reward={row.reward} onSaved={reload}/>}<TaskReflections enrollmentId={row.id}/>{row.days.length ? <><p className={styles.next}>Next task: {row.days.find(task=>!task.completedAt)?.title ?? 'All tasks completed'}</p><ol className={styles.days}>{row.days.map(task=><li key={task.id}><span className={task.completedAt?styles.check:styles.pending}>{task.completedAt?<CheckCircle2 size={16}/>:<Clock3 size={16}/>}</span><span><small>Day {task.day_number}</small><strong>{task.title}</strong></span><span>{task.completedAt?date(task.completedAt):'To do'}</span></li>)}</ol></> : <p>Daily tasks have not been configured for this course.</p>}</div>
      </details>)}
      </section><p className={styles.footnote}>Progress comes from saved task completions. Only active course enrollments are included.</p>
    </>}
  </div>;
}

import { createClient } from '@/lib/supabase/client';
import { DataError, unwrap } from './errors';
import { getChallengeRewards } from './challenge-rewards';

export interface TaskProgressRow {
  id: string; member_id: string; offering_id: string;
  offerings: { title: string; kind: string };
  members: { first_name: string | null; last_name: string | null; user_id: string; users: { email: string; name: string | null } | null };
}
export interface ProgressTask { id: string; offering_id: string; day_number: number; title: string }
export interface ProgressCompletion { enrollment_id: string; task_id: string; completed_at: string }

/** Read all pages so larger cohorts do not silently lose completion records. */
async function readPages<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const page = (unwrap(await query(from, from + 499), 'admin.taskProgress') ?? []) as T[];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
export async function getAdminTaskProgress() {
  const db = createClient();
  const [enrollments, tasks, completions, rewards] = await Promise.all([
    readPages<TaskProgressRow>((from,to) => db.from('offering_enrollments').select('id, member_id, offering_id, offerings!inner(title, kind), members!offering_enrollments_member_id_fkey(first_name, last_name, user_id, users!members_user_id_fkey(email, name))').eq('status','active').eq('offerings.kind','course').order('id').range(from,to)),
    readPages<ProgressTask>((from,to) => db.from('offering_daily_tasks').select('id, offering_id, day_number, title').order('id').range(from,to)),
    readPages<ProgressCompletion>((from,to) => db.from('offering_task_completions').select('enrollment_id, task_id, completed_at').order('enrollment_id').order('task_id').range(from,to)),
    getChallengeRewards().then(rewards=>({rewards,pending:false})).catch(error=>{
      if (error instanceof DataError && error.kind === 'unavailable') return {rewards:[],pending:true};
      throw error;
    }),
  ]);
  return summarizeTaskProgress(enrollments, tasks, completions).map(row=>({...row,reward:rewards.rewards.find(reward=>reward.enrollment_id===row.id) ?? null,rewardSetupPending:rewards.pending}));
}

export function summarizeTaskProgress(enrollments: TaskProgressRow[], tasks: ProgressTask[], completions: ProgressCompletion[]) {
  return enrollments.map(enrollment => {
    const records = new Map(completions.filter(c => c.enrollment_id === enrollment.id).map(c => [c.task_id,c.completed_at]));
    const days = tasks.filter(t => t.offering_id === enrollment.offering_id).sort((a,b)=>a.day_number-b.day_number).map(task => ({ ...task, completedAt: records.get(task.id) ?? null }));
    const done = days.filter(task => task.completedAt);
    const name = [enrollment.members?.first_name,enrollment.members?.last_name].filter(Boolean).join(' ') || enrollment.members?.users?.name || 'Member';
    return { ...enrollment, name, email: enrollment.members?.users?.email ?? '', days, completed: done.length, total: days.length, percent: days.length ? Math.round(done.length/days.length*100) : 0,
      latest: done.map(task=>task.completedAt!).sort().at(-1) ?? null,
      status: !days.length ? 'unconfigured' : done.length === days.length ? 'completed' : done.length ? 'in_progress' : 'not_started' };
  }).sort((a,b)=>(b.latest ?? '').localeCompare(a.latest ?? '') || a.name.localeCompare(b.name));
}

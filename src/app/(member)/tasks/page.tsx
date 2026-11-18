"use client";
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/useAsync';
import { getMyProfile } from '@/lib/data/member';
import { DailyCourseProgress } from '@/components/member/DailyCourseProgress';
import { TasksView } from '@/components/pages/TasksView';
import { ErrorState } from '@/components/ui/States';

export default function Page() {
  const { user } = useAuth();
  const profile = useAsync(getMyProfile, [user?.id], Boolean(user));
  return <div className="space-y-6"><header><h1 className="fsp-dot text-2xl font-bold">Tasks &amp; Challenges</h1><p className="mt-2 text-sm text-[var(--muted)]">Your joined challenges, next tasks, and saved progress.</p></header>
    {profile.error && <ErrorState error={profile.error} onRetry={profile.reload}/>}
    <section className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]" aria-label="Your challenge tasks"><DailyCourseProgress key={user?.id} memberId={profile.data?.user_id === user?.id ? profile.data?.id : undefined} compact/></section>
    <details className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4"><summary className="cursor-pointer text-sm font-semibold">Other assignments &amp; submissions</summary><div className="mt-5"><TasksView/></div></details>
  </div>;
}

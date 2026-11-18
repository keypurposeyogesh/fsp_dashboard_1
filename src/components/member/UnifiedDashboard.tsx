"use client";
import Link from 'next/link';
import { ArrowRight, Compass, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/useAsync';
import { getMyProfile } from '@/lib/data/member';
import { DailyCourseProgress } from './DailyCourseProgress';
import { ChallengeCommunity } from './ChallengeCommunity';
import { ChallengeRewards } from './ChallengeRewards';
import { TodaysUpdates } from './TodaysUpdates';
import { CoursesView } from '@/components/pages/CoursesView';
import styles from './Overview.module.css';

export function UnifiedDashboard() {
  const { user } = useAuth();
  const account = useAsync(getMyProfile,[user?.id],Boolean(user));
  const memberId = account.data?.user_id === user?.id ? account.data?.id : undefined;
  const refresh = () => { account.reload(); window.dispatchEvent(new Event('fsp-enrollment-changed')); window.dispatchEvent(new Event('fsp-learning-changed')); };
  return <div className={styles.overview}>
    <header className={styles.heading}><div><p className={styles.eyebrow}>YOUR 30-DAY CHALLENGE</p><h1>Small steps. Lasting progress<span>.</span></h1><p>30 tasks, 40 days, and up to 3,000 discount points. Keep going at your pace.</p></div><button type="button" onClick={refresh} className={styles.refresh} aria-label="Refresh challenge" disabled={account.loading} data-action="refresh"><RefreshCw size={17}/><span>Refresh</span></button></header>
    {account.error && <div className={styles.error} role="alert">{account.error.message}<button onClick={refresh}>Try again</button></div>}
    <div className={styles.frontGrid}><div className={styles.frontMain}>
      <section id="my-learning" className={styles.learning}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>YOUR NEXT STEP</p><h2>Continue your challenge</h2></div><Link href="/tasks">All tasks<ArrowRight size={16}/></Link></div><div className={styles.learningList}><DailyCourseProgress key={user?.id} memberId={memberId} compact/></div></section>
      {account.data && <ChallengeRewards key={user?.id}/>}
      <details className={styles.discover}><summary><span className={styles.discoverIcon}><Compass size={20}/></span><span><strong>Discover more FSP programs</strong><span>Explore courses, gatherings, and new challenges</span></span><span className={styles.discoverAction}>Explore<ArrowRight size={16}/></span></summary><div className={styles.catalogue}><CoursesView dashboard/></div></details>
    </div><aside className={styles.frontUpdates} aria-label="Latest FSP updates"><TodaysUpdates limit={3}/>{account.data && <ChallengeCommunity compact/>}</aside></div>
  </div>;
}

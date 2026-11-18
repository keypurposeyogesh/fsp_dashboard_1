"use client";
import { useEffect } from 'react';
import { CalendarDays, Check, Coins, ShieldCheck, Trophy, Flag, Sprout, Rocket, LockKeyhole, ArrowRight, Flame, Target, Award, User, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAsync } from '@/lib/useAsync';
import { useEnrollmentRefresh } from '@/lib/enrollment-refresh';
import { getChallengeRewards } from '@/lib/data/challenge-rewards';
import { challengeCalendar, challengeStreak } from '@/lib/challenge-calendar';
import { growthProgress } from '@/lib/gamification';
import styles from './ChallengeRewards.module.css';

const date = (value: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));

const MILESTONES = [
  { at: 1, label: 'First step', Icon: Sprout },
  { at: 10, label: 'Habit builder', Icon: Flag },
  { at: 20, label: 'Momentum', Icon: Rocket },
  { at: 30, label: 'Challenge champion', Icon: Trophy },
];

/** growthProgress() names its badge icons; map them to the real components. */
const BADGE_ICON: Record<string, LucideIcon> = { sprout: Sprout, user: User, award: Award, flame: Flame };

export function ChallengeRewards({ profilePercent = 0 }: { profilePercent?: number }) {
  const { data, error, loading, reload } = useAsync(getChallengeRewards);
  useEnrollmentRefresh(reload);
  useEffect(() => {
    window.addEventListener('fsp-learning-changed', reload);
    return () => window.removeEventListener('fsp-learning-changed', reload);
  }, [reload]);

  if (error) return <section className={styles.notice} role="alert">
    <strong>Challenge rewards unavailable</strong>
    <p>{error.kind === 'unavailable' ? 'The challenge reward setup is pending. Your saved task progress is unchanged.' : error.message}</p>
    <button onClick={reload}>Try again</button>
  </section>;

  if (loading && !data) return <p role="status" className={styles.notice}>Loading your challenge calendar and points...</p>;

  /* No challenge row yet. The RPC succeeded and returned nothing, so zeroes are
     honest here - show the whole game in its locked state rather than one card,
     so a member can see what they are working towards. Badges are profile-driven
     and already real. */
  if (!data?.length) {
    const growth = growthProgress(profilePercent, []);
    return <div className={styles.group}>
      <section className={styles.quest} aria-label="Your challenge status">
        <div className={styles.questTop}>
          <span className={styles.levelPill}><Sparkles size={13} />Level {growth.level}</span>
          <span className={styles.window}>Not started</span>
        </div>
        <div className={styles.questBody}>
          <div className={styles.questCopy}>
            <p className={styles.kicker}>YOUR QUEST AWAITS</p>
            <h2>30 tasks. 40 days.</h2>
            <p className={styles.questNote}>Your calendar starts when your challenge enrollment is approved. Every saved task earns 100 points; missed days never reset progress.</p>
            <div className={styles.xpRow}>
              <span><strong>{growth.xp.toLocaleString()}</strong> XP</span>
              <span>{growth.nextXP} XP to level {growth.level + 1}</span>
            </div>
            <div
              className={styles.xpBar}
              role="progressbar"
              aria-label={`Level ${growth.level} progress`}
              aria-valuemin={0}
              aria-valuemax={250}
              aria-valuenow={growth.levelXP}
            ><span style={{ width: `${Math.round(growth.levelXP / 250 * 100)}%` }} /></div>
            <a href="#my-learning" className={styles.goldCta}>See your programs<ArrowRight size={15} /></a>
          </div>
          <div className={styles.prize} aria-label="3,000 point completion reward">
            <span className={styles.trophy}><Trophy size={38} strokeWidth={1.5} /><Sparkles size={14} /></span>
            <strong>3,000</strong>
            <span>POINT REWARD</span>
          </div>
        </div>
      </section>

      <div className={styles.tiles}>
        <div><span className={styles.tileIcon}><Check size={17} /></span><strong>0<small>/30</small></strong><span>Tasks done</span></div>
        <div><span className={styles.tileIcon}><Coins size={17} /></span><strong>0</strong><span>Points earned</span></div>
        <div><span className={styles.tileIcon}><Trophy size={17} /></span><strong>0</strong><span>Redeemable now</span></div>
        <div><span className={styles.tileIcon}><Flame size={17} /></span><strong>0</strong><span>Day streak</span></div>
      </div>

      <section className={styles.badgeCard} aria-label="Your badges">
        <h3><Award size={15} />Badges<span>{growth.badges.filter(b => b.earned).length} of {growth.badges.length} earned</span></h3>
        <div className={styles.badges}>
          {growth.badges.map(badge => {
            const Icon = BADGE_ICON[badge.icon] ?? Award;
            return <div key={badge.name} className={badge.earned ? styles.badgeEarned : styles.badgeLocked}>
              <span className={styles.badgeMedal}>
                <Icon size={22} />
                {!badge.earned && <span className={styles.badgeLock}><LockKeyhole size={9} /></span>}
              </span>
              <strong>{badge.name}</strong>
              <small>{badge.earned ? 'Earned' : badge.description}</small>
            </div>;
          })}
        </div>
      </section>

      <section className={styles.milestoneCard} aria-label="Challenge milestones">
        <h3><Target size={15} />Milestones</h3>
        <div className={styles.milestones}>
          {MILESTONES.map(({ at, label, Icon }) => <div key={at} className={styles.locked} title={`${label}: ${at} completed ${at === 1 ? 'task' : 'tasks'}`}>
            <span className={styles.medal}><Icon size={21} /><span><LockKeyhole size={9} /></span></span>
            <strong>{label}</strong>
            <small>{at} {at === 1 ? 'task' : 'tasks'}</small>
          </div>)}
        </div>
      </section>

      <p className={styles.footnote}>
        <ShieldCheck size={15} />
        <span>Discount points unlock after all 30 tasks are completed. An FSP admin applies your discount manually.</span>
      </p>
    </div>;
  }

  return <div className={styles.rewards}>{data.map(reward => {
    const days = challengeCalendar(reward);
    const streak = challengeStreak(reward);
    const today = days.find(day => day.today)?.day;
    const percent = Math.round(reward.completed_tasks / 30 * 100);
    const nextMilestone = MILESTONES.find(item => reward.completed_tasks < item.at);
    const completionReward = reward.window_open || reward.on_time ? '3,000' : '1,500';
    const done = reward.completed_tasks === 30;

    /* XP, level and badges come from the saved completion dates - no extra query. */
    const records = reward.completion_dates.map((completed_at, index) => ({
      enrollment_id: reward.enrollment_id,
      task_id: `task-${index}`,
      completed_at,
    }));
    const growth = growthProgress(profilePercent, records);
    const levelPercent = Math.round(growth.levelXP / 250 * 100);
    const earnedBadges = growth.badges.filter(badge => badge.earned).length;

    return <div className={styles.group} key={reward.enrollment_id}>

      {/* ---- the quest panel: dark, so gold reads at 10:1 instead of 2:1 ---- */}
      <section className={`${styles.quest} ${done ? styles.questDone : ''}`} aria-label="Your challenge status">
        <div className={styles.questTop}>
          <span className={styles.levelPill}><Sparkles size={13} />Level {growth.level}</span>
          <span className={styles.window}>{reward.window_open ? `Day ${today ?? 1} of 40` : '40-day window ended'}</span>
        </div>

        <div className={styles.questBody}>
          <div className={styles.questCopy}>
            <p className={styles.kicker}>{done ? 'CHALLENGE COMPLETE' : 'YOUR QUEST'}</p>
            <h2>{done ? 'You did it!' : <><strong>{reward.completed_tasks}</strong> of 30 tasks done</>}</h2>
            <p className={styles.questNote}>
              {nextMilestone
                ? `${nextMilestone.at - reward.completed_tasks} more ${nextMilestone.at - reward.completed_tasks === 1 ? 'task' : 'tasks'} to unlock ${nextMilestone.label.toLowerCase()}.`
                : 'All four milestones unlocked. What a journey!'}
            </p>

            <div className={styles.xpRow}>
              <span><strong>{growth.xp.toLocaleString()}</strong> XP</span>
              <span>{growth.nextXP} XP to level {growth.level + 1}</span>
            </div>
            <div
              className={styles.xpBar}
              role="progressbar"
              aria-label={`Level ${growth.level} progress`}
              aria-valuemin={0}
              aria-valuemax={250}
              aria-valuenow={growth.levelXP}
              aria-valuetext={`${growth.levelXP} of 250 XP towards level ${growth.level + 1}`}
            >
              <span style={{ width: `${levelPercent}%` }} />
            </div>

            <a href="#my-learning" className={styles.goldCta}>
              {done ? 'Review your tasks' : 'Continue your challenge'}<ArrowRight size={15} />
            </a>
          </div>

          <div className={styles.prize} aria-label={`${completionReward} point completion reward`}>
            <span className={styles.trophy}><Trophy size={38} strokeWidth={1.5} /><Sparkles size={14} /></span>
            <strong>{completionReward}</strong>
            <span>POINT REWARD</span>
          </div>
        </div>

        <p className={styles.questDates}>{date(reward.started_at)} - {date(new Date(Date.parse(reward.deadline_at) - 1).toISOString())} · India time</p>
      </section>

      {/* ---- score tiles ---- */}
      <div className={styles.tiles}>
        <div>
          <span className={styles.tileIcon}><Check size={17} /></span>
          <strong>{reward.completed_tasks}<small>/30</small></strong>
          <span>Tasks done</span>
        </div>
        <div>
          <span className={styles.tileIcon}><Coins size={17} /></span>
          <strong>{reward.earned_points.toLocaleString()}</strong>
          <span>Points earned</span>
        </div>
        <div>
          <span className={styles.tileIcon}><Trophy size={17} /></span>
          <strong>{reward.available_points.toLocaleString()}</strong>
          <span>Redeemable now</span>
        </div>
        <div>
          <span className={styles.tileIcon}><Flame size={17} /></span>
          <strong>{streak.current}</strong>
          <span>Day streak</span>
        </div>
      </div>

      <div className={styles.meterWrap}>
        <div className={styles.meterLabel}>
          <span>Challenge progress</span>
          <strong>{percent}% complete</strong>
        </div>
        <div
          className={styles.meter}
          role="progressbar"
          aria-label="Thirty-task challenge progress"
          aria-valuemin={0}
          aria-valuemax={30}
          aria-valuenow={reward.completed_tasks}
          aria-valuetext={`${reward.completed_tasks} of 30 tasks completed`}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <p className={styles.rule}>{done
          ? reward.on_time
            ? 'Finished within 40 days. Your 3,000-point reward is secured.'
            : 'Finished after 40 days. Your completion reward is 1,500 points.'
          : reward.window_open
            ? 'Earn 100 points per task. Finish all 30 within this window to unlock 3,000 redeemable points.'
            : 'Your progress is saved. Finish the remaining tasks to unlock 1,500 redeemable points.'}</p>
      </div>

      {/* ---- badges ---- */}
      <section className={styles.badgeCard} aria-label="Your badges">
        <h3><Award size={15} />Badges<span>{earnedBadges} of {growth.badges.length} earned</span></h3>
        <div className={styles.badges}>
          {growth.badges.map(badge => {
            const Icon = BADGE_ICON[badge.icon] ?? Award;
            return <div key={badge.name} className={badge.earned ? styles.badgeEarned : styles.badgeLocked}>
              <span className={styles.badgeMedal}>
                <Icon size={22} />
                {!badge.earned && <span className={styles.badgeLock}><LockKeyhole size={9} /></span>}
              </span>
              <strong>{badge.name}</strong>
              <small>{badge.earned ? 'Earned' : badge.description}</small>
            </div>;
          })}
        </div>
      </section>

      {/* ---- milestone rail ---- */}
      <section className={styles.milestoneCard} aria-label="Challenge milestones">
        <h3><Target size={15} />Milestones</h3>
        <div className={styles.milestones}>
          {MILESTONES.map(({ at, label, Icon }) => {
            const unlocked = reward.completed_tasks >= at;
            return <div key={at} className={unlocked ? styles.unlocked : styles.locked} title={`${label}: ${at} completed ${at === 1 ? 'task' : 'tasks'}`}>
              <span className={styles.medal}>
                <Icon size={21} />
                <span>{unlocked ? <Check size={10} /> : <LockKeyhole size={9} />}</span>
              </span>
              <strong>{label}</strong>
              <small>{unlocked ? 'Unlocked' : `${at} ${at === 1 ? 'task' : 'tasks'}`}</small>
            </div>;
          })}
        </div>
      </section>

      {/* ---- streak ---- */}
      <section className={styles.streakCard} aria-label="Your learning streak">
        <div className={styles.streakSummary}>
          <span className={styles.flame}><Flame size={22} /></span>
          <div>
            <h3>Your streak</h3>
            <strong>{streak.current} <span>{streak.current === 1 ? 'day' : 'days'}</span></strong>
            <p>Best: {streak.best} {streak.best === 1 ? 'day' : 'days'} · {streak.activeDays} learning days</p>
          </div>
        </div>
        <div className={styles.streakWeek}>
          {streak.week.map(day => <div key={day.date}>
            <span>{day.label}</span>
            <span
              className={day.complete ? styles.streakDone : styles.streakEmpty}
              aria-label={`Learning day ${day.date}: ${day.complete ? 'task completed' : 'no completed task'}`}
            >{day.complete ? <Check size={13} /> : <span>·</span>}</span>
          </div>)}
        </div>
        <p className={styles.streakNote}>A task a day builds your streak. Your best streak, completed tasks, and points stay saved.</p>
      </section>

      {/* ---- 40-day calendar ---- */}
      {reward.window_open && <details className={styles.calendarDetails}>
        <summary>
          <span className={styles.calendarIcon}><CalendarDays size={18} /></span>
          <span>
            <strong>40-day calendar</strong>
            <span>Missed days never reset your progress</span>
          </span>
          <span className={styles.summaryAction}>View<ArrowRight size={14} /></span>
        </summary>
        <div className={styles.calendarBody}>
          <div className={styles.calendar}>
            {days.map(day => <div
              key={day.day}
              className={[styles.day, day.complete ? styles.done : '', day.today ? styles.today : '', day.past && !day.complete ? styles.missed : ''].filter(Boolean).join(' ')}
              aria-label={`Day ${day.day}, ${day.date}${day.complete ? ', task completed' : day.past ? ', no task completed' : ''}`}
              aria-current={day.today ? 'date' : undefined}
            >
              <span>{day.day}</span>
              <small>{day.date.slice(8)}/{day.date.slice(5, 7)}</small>
              {day.complete && <Check size={12} />}
            </div>)}
          </div>
          <div className={styles.legend}>
            <span>Tick: task saved</span>
            <span>Outlined: today</span>
            <span>Calendar hides after day 40; your points and history stay</span>
          </div>
        </div>
      </details>}

      <p className={styles.footnote}>
        <ShieldCheck size={15} />
        <span>Discount points unlock after all 30 tasks are completed. An FSP admin applies your discount manually.
          {reward.redeemed_points > 0 ? ` ${reward.redeemed_points.toLocaleString()} points already used.` : ''}
        </span>
      </p>
    </div>;
  })}</div>;
}

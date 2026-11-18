"use client";
import { useEffect } from 'react';
import { CalendarDays, Check, Coins, ShieldCheck, Trophy, Sparkles, Flag, Sprout, Rocket, LockKeyhole, ArrowRight, Flame } from 'lucide-react';
import { useAsync } from '@/lib/useAsync';
import { useEnrollmentRefresh } from '@/lib/enrollment-refresh';
import { getChallengeRewards } from '@/lib/data/challenge-rewards';
import { challengeCalendar, challengeStreak } from '@/lib/challenge-calendar';
import styles from './ChallengeRewards.module.css';

const date = (value: string) => new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric'}).format(new Date(value));
export function ChallengeRewards() {
  const { data, error, loading, reload } = useAsync(getChallengeRewards);
  useEnrollmentRefresh(reload);
  useEffect(()=>{ window.addEventListener('fsp-learning-changed',reload);return()=>window.removeEventListener('fsp-learning-changed',reload); },[reload]);
  if (error) return <section className={styles.notice} role="alert"><strong>Challenge rewards unavailable</strong><p>{error.kind === 'unavailable' ? 'The challenge reward setup is pending. Your saved task progress is unchanged.' : error.message}</p><button onClick={reload}>Try again</button></section>;
  if (loading && !data) return <p role="status" className={styles.notice}>Loading your challenge calendar and points...</p>;
  if (!data?.length) return <div className={styles.intro}><CalendarDays/><div><strong>30 tasks. 40 days. Up to 3,000 points.</strong><p>Your calendar starts when your challenge enrollment is approved. Every saved task earns 100 points; missed days never reset progress.</p></div></div>;
  return <div className={styles.rewards}>{data.map(reward=>{
    const days=challengeCalendar(reward);
    const streak=challengeStreak(reward);
    const today=days.find(day=>day.today)?.day;
    const percent=Math.round(reward.completed_tasks/30*100);
    const milestones=[{at:1,label:'First step',Icon:Sprout},{at:10,label:'Habit builder',Icon:Flag},{at:20,label:'Momentum',Icon:Rocket},{at:30,label:'Challenge champion',Icon:Trophy}];
    const nextMilestone=milestones.find(item=>reward.completed_tasks<item.at);
    return <section className={styles.card} key={reward.enrollment_id} aria-label="30-day challenge rewards"><header><div><span className={styles.eyebrow}>FSP 30 DAYS CHALLENGE</span><h2>{reward.completed_tasks===30?'Challenge completed!':'Your 40-day journey'}</h2><p>{date(reward.started_at)} - {date(new Date(Date.parse(reward.deadline_at)-1).toISOString())} · India time</p></div><span className={styles.window}>{reward.window_open ? `Day ${today ?? 1} of 40` : '40-day window ended'}</span></header>
      <div className={styles.rewardHero}><div className={styles.heroCopy}><span><Sparkles size={13}/> EVERY TASK COUNTS</span><h3>{reward.completed_tasks===30?"You did it. Own your achievement.":reward.completed_tasks===0?"Your next chapter starts today.":`${reward.completed_tasks} ${reward.completed_tasks===1?"step":"steps"} closer to your goal.`}</h3><p>{nextMilestone?`${nextMilestone.at-reward.completed_tasks} more ${nextMilestone.at-reward.completed_tasks===1?"task":"tasks"} to unlock ${nextMilestone.label.toLowerCase()}.`:"All four milestones unlocked. What a journey!"}</p><a href="#my-learning">{reward.completed_tasks===30?"Review your tasks":"Take your next step"}<ArrowRight size={14}/></a></div><div className={styles.prize} aria-label={`${reward.window_open||reward.on_time?"3,000":"1,500"} point completion reward`}><div className={styles.trophy}><Trophy size={43} strokeWidth={1.5}/><Sparkles size={15}/></div><strong>{reward.window_open||reward.on_time?"3,000":"1,500"}</strong><span>POINT REWARD</span></div></div>
      <div className={styles.metrics}><div><Check/><span><strong>{reward.completed_tasks}<small>/30</small></strong><span>Tasks completed</span></span></div><div><Coins/><span><strong>{reward.earned_points.toLocaleString()}</strong><span>Task points earned</span></span></div><div><Trophy/><span><strong>{reward.available_points.toLocaleString()}</strong><span>Redeemable points</span></span></div></div>
      <div className={styles.progressCaption}><strong>Your challenge progress</strong><span>{percent}% complete</span></div>
      <progress max={30} value={reward.completed_tasks} aria-label="Thirty-task challenge progress"/>
      <p className={styles.rule}>{reward.completed_tasks===30 ? reward.on_time ? 'Finished within 40 days. Your 3,000-point reward is secured.' : 'Finished after 40 days. Your completion reward is 1,500 points.' : reward.window_open ? 'Earn 100 points per task. Finish all 30 within this window to unlock 3,000 redeemable points.' : 'Your progress is saved. Finish the remaining tasks to unlock 1,500 redeemable points.'}</p>
      <section className={styles.streak} aria-label="Your learning streak"><div className={styles.streakSummary}><span className={styles.flame}><Flame size={24}/></span><div><h3>Your streak</h3><strong>{streak.current} <span>{streak.current===1?'day':'days'}</span></strong><p>Best: {streak.best} {streak.best===1?'day':'days'} · {streak.activeDays} learning days</p></div></div><div className={styles.streakWeek}>{streak.week.map(day=><div key={day.date}><span>{day.label}</span><span className={day.complete?styles.streakDone:styles.streakEmpty} aria-label={`Learning day ${day.date}: ${day.complete?'task completed':'no completed task'}`}>{day.complete?<Check size={14}/>:<span>·</span>}</span></div>)}</div><p className={styles.streakNote}>A task a day builds your streak. Your best streak, completed tasks, and points stay saved.</p></section>
      <div className={styles.milestones} aria-label="Challenge milestones">{milestones.map(({at,label,Icon})=>{const unlocked=reward.completed_tasks>=at;return <div key={at} className={unlocked?styles.unlocked:styles.locked} title={`${label}: ${at} completed ${at===1?'task':'tasks'}`}><span className={styles.medal}><Icon size={23}/><span>{unlocked?<Check size={10}/>:<LockKeyhole size={9}/>}</span></span><strong>{label}</strong><small>{unlocked?'Unlocked':`${at} ${at===1?'task':'tasks'}`}</small></div>;})}</div>
      {reward.window_open && <><div className={styles.calendarHeading}><h3><CalendarDays size={16}/>40-day calendar</h3><span>Missed days never reset your progress</span></div><div className={styles.calendar}>{days.map(day=><div key={day.day} className={[styles.day,day.complete?styles.done:'',day.today?styles.today:'',day.past&&!day.complete?styles.missed:''].join(' ')} aria-label={`Day ${day.day}, ${day.date}${day.complete?', task completed':day.past?', no task completed':''}`} aria-current={day.today?'date':undefined}><span>{day.day}</span><small>{day.date.slice(8)}/{day.date.slice(5,7)}</small>{day.complete&&<Check size={12}/>}</div>)}</div><div className={styles.legend}><span>✓ Task saved</span><span>Outlined: today</span><span>Calendar hides after day 40; your points and history stay</span></div></>}
      <footer><ShieldCheck size={16}/><p>Discount points unlock after all 30 tasks are completed. An FSP admin applies your discount manually.{reward.redeemed_points>0?` ${reward.redeemed_points.toLocaleString()} points already used.`:''}</p></footer>
    </section>;
  })}</div>;
}


export interface ChallengeReward {
  enrollment_id: string;
  started_at: string;
  deadline_at: string;
  server_now: string;
  completed_tasks: number;
  earned_points: number;
  eligible_points: number;
  redeemed_points: number;
  available_points: number;
  completed_at: string | null;
  on_time: boolean;
  window_open: boolean;
  completion_dates: string[];
  redemptions?: { id: string; points: number; note: string; created_at: string }[];
}

export const indiaDate = (value: string | Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',
}).format(new Date(value));

/** Uses the server's time snapshot; browser time never determines discount eligibility. */
export function challengeCalendar(reward: ChallengeReward) {
  const start = indiaDate(reward.started_at);
  const today = indiaDate(reward.server_now);
  const completedDates = new Set(reward.completion_dates.map(indiaDate));
  return Array.from({length:40},(_,index)=>{
    const date = new Date(`${start}T12:00:00+05:30`);
    date.setUTCDate(date.getUTCDate()+index);
    const key = indiaDate(date);
    return { day:index+1,date:key,complete:completedDates.has(key),today:key===today,past:key<today };
  });
}

/** Learning-day streaks count dates, not clicks; best streak is retained. */
export function challengeStreak(reward: ChallengeReward) {
  const now=Date.parse(reward.server_now);
  const today=Date.parse(indiaDate(reward.server_now));
  const days=[...new Set(reward.completion_dates.filter(value=>Number.isFinite(Date.parse(value))&&Date.parse(value)<=now).map(value=>Date.parse(indiaDate(value))))].sort((a,b)=>a-b);
  let run=0,best=0,previous=0;
  for(const day of days){run=day-previous===86400000?run+1:1;best=Math.max(best,run);previous=day;}
  const latest=days.at(-1);
  const current=latest!==undefined&&(latest===today||latest===today-86400000)?run:0;
  const saved=new Set(days);
  const week=Array.from({length:7},(_,index)=>{const timestamp=today-(6-index)*86400000;return {date:new Date(timestamp).toISOString().slice(0,10),label:new Intl.DateTimeFormat('en',{timeZone:'Asia/Kolkata',weekday:'short'}).format(new Date(timestamp)),complete:saved.has(timestamp)};});
  return {current,best,activeDays:days.length,week};
}

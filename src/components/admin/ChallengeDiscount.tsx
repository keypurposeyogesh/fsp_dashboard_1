"use client";
import { useRef, useState } from 'react';
import type { ChallengeReward } from '@/lib/challenge-calendar';
import { recordChallengeDiscount } from '@/lib/data/challenge-rewards';
import { toDataError } from '@/lib/data/errors';
import { notifyEnrollmentChanged } from '@/lib/enrollment-refresh';

export function ChallengeDiscount({ reward, onSaved }: { reward: ChallengeReward; onSaved:()=>void }) {
  const [points,setPoints]=useState('');
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const request=useRef<string|null>(null);
  const reference=useRef('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const amount=Number(points);
    if (!Number.isInteger(amount)||amount<1||amount>reward.available_points||note.trim().length<3) {setError('Enter available points and a unique invoice or discount reference.');return;}
    const signature=`${amount}:${note.trim()}`;
    if(reference.current!==signature){request.current=crypto.randomUUID();reference.current=signature;}
    setBusy(true);setError('');setMessage('');
    try {
      await recordChallengeDiscount(reward.enrollment_id,amount,note.trim(),request.current!);
      setPoints('');setNote('');request.current=null;reference.current='';
      setMessage('Discount usage recorded. Points deducted from the redeemable balance.');
      notifyEnrollmentChanged();onSaved();
    } catch(err){setError(toDataError(err,'admin.challengeDiscount').message);} finally{setBusy(false);}
  }
  return <section className="my-4 space-y-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4" aria-label="Challenge discount points">
    <div className="flex flex-wrap gap-4 text-xs"><strong>{reward.completed_tasks}/30 tasks</strong><span>{reward.earned_points} task points earned</span><strong>{reward.available_points} redeemable</strong><span>{reward.redeemed_points} used</span></div>
    <p className="text-xs text-[var(--muted)]">Deadline: {new Date(Date.parse(reward.deadline_at)-1).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST. {reward.completed_tasks===30 ? reward.on_time?'On-time completion: 3,000 points.':'Late completion: 1,500 points.':'Points unlock after all 30 tasks; missed days do not reset progress.'}</p>
    {reward.available_points>0 && <form onSubmit={submit} className="flex flex-wrap items-end gap-3"><label className="text-xs">Points used<input type="number" min={1} max={reward.available_points} step={1} required disabled={busy} value={points} onChange={e=>setPoints(e.target.value)} className="mt-1 block w-32 rounded-lg border border-[var(--card-border)] p-2"/></label><label className="flex-1 text-xs">Invoice / discount reference<input required minLength={3} maxLength={1000} disabled={busy} value={note} onChange={e=>setNote(e.target.value)} placeholder="Unique reference for the discount applied" className="mt-1 block w-full min-w-48 rounded-lg border border-[var(--card-border)] p-2"/></label><button type="submit" disabled={busy} className="rounded-lg bg-[var(--brand-navy)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy?'Recording...':'Record applied discount'}</button><p className="w-full text-[10px] text-[var(--muted)]">Apply the discount manually first, then record its points here. This form does not change course prices or convert points to money.</p></form>}
    {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}{message&&<p role="status" className="text-xs text-green-700">{message}</p>}
    {!!reward.redemptions?.length&&<details><summary className="cursor-pointer text-xs font-semibold">Discount usage history</summary><ul className="mt-2 space-y-2 text-xs">{reward.redemptions.map(item=><li key={item.id}>{item.points} points - {item.note} - {new Date(item.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</li>)}</ul></details>}
  </section>;
}

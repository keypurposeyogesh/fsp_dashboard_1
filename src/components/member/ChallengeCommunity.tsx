"use client";
import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, Users, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/useAsync';
import { useEnrollmentRefresh, notifyEnrollmentChanged } from '@/lib/enrollment-refresh';
import { getChallengeCommunity, hideChallengeReflection, type ChallengePost } from '@/lib/data/challenge-community';
import { toDataError } from '@/lib/data/errors';
import styles from './ChallengeCommunity.module.css';

export function ChallengeCommunity({compact=false}:{compact?:boolean}) {
  const {role}=useAuth();
  const [cursor,setCursor]=useState<Pick<ChallengePost,'created_at'|'post_id'>|undefined>();
  const [busy,setBusy]=useState<string|null>(null);
  const [actionError,setActionError]=useState('');
  const limit=compact?3:20;
  const {data,error,loading,reload,setData}=useAsync(()=>getChallengeCommunity(limit,cursor),[limit,cursor?.post_id]);
  useEnrollmentRefresh(reload);
  const path=role==='admin'||role==='super_admin'?'/admin/challenge-community':'/challenge-community';
  async function hide(post:ChallengePost) {
    if(busy)return;
    if(!window.confirm('Hide this reflection from the community? Saved task progress and points will stay unchanged.'))return;
    setBusy(post.post_id);setActionError('');
    try{await hideChallengeReflection(post.post_id);setData(previous=>previous?.filter(row=>row.post_id!==post.post_id)??[]);notifyEnrollmentChanged();reload();}
    catch(err){setActionError(toDataError(err,'challenge.hide').message);}finally{setBusy(null);}
  }
  return <section className={compact?styles.compact:styles.page} aria-label="Challenge Community"><header><div><span className={styles.eyebrow}><Users size={13}/>LEARN TOGETHER</span><h2>Challenge Community</h2><p>{compact?'Small wins and reflections from fellow members.':'See how fellow members practice their 30-day challenge tasks. Shared reflections are visible to signed-in FSP members.'}</p></div>{!compact&&<button onClick={reload} disabled={loading} data-action="refresh">Refresh</button>}</header>
    {compact&&<Link className={styles.viewAll} href={path}>View community<ArrowRight size={14}/></Link>}
    {error&&<p className={styles.error} role="alert">{error.kind==='unavailable'?'Community sharing is being set up. Saved task progress is unchanged.':error.message}<button onClick={reload}>Try again</button></p>}
    {actionError&&<p className={styles.error} role="alert">{actionError}</p>}
    {loading&&!data&&<p role="status" className={styles.empty}>Loading member reflections...</p>}
    {data?.length===0&&<div className={styles.empty}><BookOpen size={23}/><strong>{cursor?'No more reflections on this page.':'Every journey has a first story.'}</strong><p>Complete a challenge task and choose to share your reflection here.</p></div>}
    <div className={styles.posts}>{data?.map(post=><article key={post.post_id} className={styles.post}><div className={styles.author}><span>{post.author_name.slice(0,1).toUpperCase()}</span><div><strong>{post.author_name}</strong><time dateTime={post.created_at}>{new Date(post.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})} IST</time></div><span className={styles.day}><CheckCircle2 size={12}/>Day {post.day_number}</span></div><h3>{post.task_title}</h3>{compact?<p className={styles.excerpt}>{post.reflection}</p>:<><div className={styles.reflection}><h4>Task explanation</h4><p>{post.reflection}</p></div>{post.learning && <div className={styles.reflection}><h4>Earlier learning note</h4><p>{post.learning}</p></div>}</>}{!compact&&post.can_hide&&<button className={styles.hide} disabled={busy!==null} onClick={()=>void hide(post)}>{busy===post.post_id?'Hiding...':'Hide from community'}</button>}</article>)}</div>
    {!compact&&<footer><p>Task progress and points are saved separately from sharing. Owners and admins can hide a shared reflection.</p><div>{cursor&&<button onClick={()=>setCursor(undefined)}>Back to latest</button>}{data?.length===limit&&<button disabled={loading} onClick={()=>{const last=data.at(-1);if(last)setCursor({created_at:last.created_at,post_id:last.post_id});}}>Older reflections<ArrowRight size={14}/></button>}</div></footer>}
  </section>;
}

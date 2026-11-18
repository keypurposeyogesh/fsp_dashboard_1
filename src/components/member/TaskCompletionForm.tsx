"use client";
import { useRef, useState } from 'react';
import { CheckCircle2, Users } from 'lucide-react';
import styles from './TaskCompletionForm.module.css';

export interface CompletionReflection { reflection:string; share:boolean }
export function TaskCompletionForm({busy,onSubmit}:{busy:boolean;onSubmit:(value:CompletionReflection)=>Promise<boolean>}) {
  const [reflection,setReflection]=useState('');
  const [share,setShare]=useState(true);
  const [error,setError]=useState('');
  const submitting=useRef(false);
  async function submit(event:React.FormEvent) {
    event.preventDefault();
    if(busy||submitting.current)return;
    if(reflection.trim().length<20||reflection.trim().length>2000){setError('Please explain how you completed this task in 20 to 2,000 characters.');return;}
    submitting.current=true;setError('');
    try {await onSubmit({reflection:reflection.trim(),share});}
    finally{submitting.current=false;}
  }
  return <form className={styles.form} onSubmit={submit}><fieldset disabled={busy}><legend><CheckCircle2 size={16}/>Explain your task, then mark done</legend><p className={styles.hint}>One explanation saves your task and 100 points together.</p>
    <label>Explain how you completed this task<textarea required minLength={20} maxLength={2000} rows={3} value={reflection} onChange={event=>setReflection(event.target.value)} placeholder="Briefly explain what you did to complete this task."/><span>{reflection.trim().length}/2,000 · at least 20 characters</span></label>
    <label className={styles.share}><input type="checkbox" checked={share} onChange={event=>setShare(event.target.checked)}/><span><strong><Users size={14}/>Share in Challenge Community</strong><span>All signed-in FSP members can see your name, task, and your task explanation. Avoid private or sensitive details. Uncheck to keep them visible only to you and admins.</span></span></label>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    <button type="submit" disabled={busy}>{busy?'Saving task explanation...':share?'Mark done & share +100 points':'Mark done privately +100 points'}</button><small>No duplicate points for repeat submissions.</small>
  </fieldset></form>;
}

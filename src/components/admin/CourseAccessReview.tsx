"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { enrollmentAction, enrollmentError, type OfferingEnrollment } from '@/lib/data/enrollments';
import { notifyEnrollmentChanged } from '@/lib/enrollment-refresh';
export function CourseAccessReview({row,onReviewed}:{row:OfferingEnrollment;onReviewed:()=>Promise<void>}) {
  const [note,setNote]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function review(approve:boolean){if(busy||(!approve&&!note.trim()))return;setBusy(true);setError('');try{
    const result=await enrollmentAction('review_course_access',{p_enrollment_id:row.id,p_approve:approve,p_note:note.trim()});
    if(result.id!==row.id||result.status!==(approve?'active':'access_denied'))throw new Error('Access approval could not be confirmed. Refresh and check the request.');
    notifyEnrollmentChanged();await onReviewed();
  }catch(err){setError(enrollmentError(err));}finally{setBusy(false);}}
  return <div className="mt-4 space-y-3 border-t border-[var(--card-border)] pt-4"><p className="text-sm">Course access request — approval activates this course.</p><label className="block text-sm">Admin note (required to decline)<textarea maxLength={1000} value={note} disabled={busy} onChange={event=>setNote(event.target.value)} className="mt-2 block w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-sm"/></label><div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={()=>void review(true)}>{busy?'Saving...':'Approve access'}</Button><Button size="sm" variant="outline" disabled={busy||!note.trim()} onClick={()=>void review(false)}>Decline access</Button></div>{error&&<p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}</div>;
}

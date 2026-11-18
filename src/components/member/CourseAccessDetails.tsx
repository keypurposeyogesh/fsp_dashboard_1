import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { courseAccessLabel, type Offering, type OfferingEnrollment } from '@/lib/data/enrollments';

export function CourseAccessDetails({offering,enrollment,busy,manager,hasMember,onRequest}:{offering:Offering;enrollment?:OfferingEnrollment;busy:boolean;manager:boolean;hasMember:boolean;onRequest:()=>void}) {
  if(manager)return <p className="text-sm text-[var(--muted)]">Review member access requests in Course Approvals.</p>;
  if(enrollment?.status==='active')return <div className="space-y-3"><Badge variant="success">Active</Badge><p className="text-sm">Your course access is approved. You can start learning.</p><Link href="/tasks" className="inline-block rounded-lg bg-[var(--brand-navy)] px-4 py-2 text-sm font-semibold text-white">Access course</Link></div>;
  const pending=enrollment&&enrollment.status!=='access_denied';
  return <div className="space-y-3">{enrollment&&<Badge variant="warning">{courseAccessLabel(enrollment.status)}</Badge>}{enrollment?.review_note&&<p className="text-sm">Admin note: {enrollment.review_note}</p>}
    <p className="text-sm">{pending?'Your request is awaiting administrator approval. Access unlocks after approval.':offering.registration_open===false?'Access requests have not opened for this course yet.':'Request access to this course. An administrator will review your request before access is activated.'}</p>
    {!hasMember&&<p className="text-sm">Complete your <Link href="/profile" className="underline">member profile</Link> before requesting access.</p>}
    {!pending&&<Button fullWidth disabled={busy||!hasMember||offering.registration_open===false} onClick={onRequest}>{busy?'Sending request...':offering.registration_open===false?'Coming soon':enrollment?'Request access again':'Request access'}</Button>}
  </div>;
}

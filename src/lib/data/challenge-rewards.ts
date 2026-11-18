import { createClient } from '@/lib/supabase/client';
import { unwrap } from './errors';
import type { ChallengeReward } from '@/lib/challenge-calendar';

export async function getChallengeRewards(enrollmentId?: string): Promise<ChallengeReward[]> {
  return (unwrap(await createClient().rpc('get_challenge_rewards', { p_enrollment_id:enrollmentId ?? null }), 'challenge.rewards') ?? []) as ChallengeReward[];
}
/**
 * The signed-in member's own challenges.
 *
 * get_challenge_rewards() widens its filter to every active challenge for an
 * admin ("m.user_id=auth.uid() OR public.is_admin()"), which is what the admin
 * task-progress page needs and exactly wrong on a personal dashboard: a super
 * admin saw one quest card per member, with other people's completion dates
 * feeding their own XP, streak and badges.
 *
 * Scoping by the viewer's own member_id works whatever the RPC returns.
 */
export async function getMyChallengeRewards(memberId?: string): Promise<ChallengeReward[]> {
  if (!memberId) return [];
  const [rewards, mine] = await Promise.all([
    getChallengeRewards(),
    createClient().from('offering_enrollments').select('id').eq('member_id', memberId).eq('status', 'active'),
  ]);
  const own = new Set(((unwrap(mine, 'challenge.myEnrollments') ?? []) as { id: string }[]).map(row => row.id));
  return rewards.filter(reward => own.has(reward.enrollment_id));
}

export async function recordChallengeDiscount(enrollmentId: string, points: number, note: string, requestId: string) {
  const result = unwrap(await createClient().rpc('redeem_challenge_points', { p_enrollment_id:enrollmentId,p_points:points,p_note:note,p_request_id:requestId }), 'challenge.redeem');
  if (!result?.success) throw new Error('The discount record could not be confirmed. Refresh before retrying.');
  return result;
}

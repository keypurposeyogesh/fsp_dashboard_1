import { createClient } from '@/lib/supabase/client';
import { unwrap } from './errors';
import type { ChallengeReward } from '@/lib/challenge-calendar';

export async function getChallengeRewards(enrollmentId?: string): Promise<ChallengeReward[]> {
  return (unwrap(await createClient().rpc('get_challenge_rewards', { p_enrollment_id:enrollmentId ?? null }), 'challenge.rewards') ?? []) as ChallengeReward[];
}
export async function recordChallengeDiscount(enrollmentId: string, points: number, note: string, requestId: string) {
  const result = unwrap(await createClient().rpc('redeem_challenge_points', { p_enrollment_id:enrollmentId,p_points:points,p_note:note,p_request_id:requestId }), 'challenge.redeem');
  if (!result?.success) throw new Error('The discount record could not be confirmed. Refresh before retrying.');
  return result;
}

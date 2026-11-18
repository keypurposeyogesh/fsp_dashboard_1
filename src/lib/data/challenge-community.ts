import { createClient } from '@/lib/supabase/client';
import { unwrap } from './errors';

export interface ChallengePost { post_id:string; author_name:string; day_number:number; task_title:string; reflection:string; learning:string|null; created_at:string; can_hide:boolean }
export interface TaskReflection {task_id:string;day_number:number;task_title:string;reflection:string;learning:string|null;shared:boolean;created_at:string}
export async function getChallengeCommunity(limit=20, cursor?:Pick<ChallengePost,'created_at'|'post_id'>):Promise<ChallengePost[]> {
  return (unwrap(await createClient().rpc('get_challenge_community',{p_limit:limit,p_before:cursor?.created_at??null,p_before_id:cursor?.post_id??null}),'challenge.community')??[]) as ChallengePost[];
}
export async function hideChallengeReflection(postId:string) {
  const result=unwrap(await createClient().rpc('hide_challenge_reflection',{p_post_id:postId}),'challenge.hide');
  if(!result?.success)throw new Error('The reflection could not be hidden. Please refresh.');
}
export async function getTaskReflections(enrollmentId:string):Promise<TaskReflection[]> {
  return (unwrap(await createClient().rpc('get_task_reflections',{p_enrollment_id:enrollmentId}),'challenge.reflections')??[]) as TaskReflection[];
}

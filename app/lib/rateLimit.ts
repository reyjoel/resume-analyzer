import { supabase } from './supabase';

const DAILY_LIMIT = 5;

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

export async function canAnalyze(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('daily_usage')
    .select('count')
    .eq('user_id', userId)
    .eq('date', getToday())
    .maybeSingle();

  if (!data) return true;
  return (data.count as number) < DAILY_LIMIT;
}

export async function recordAnalysis(userId: string): Promise<void> {
  const today = getToday();

  const { data } = await supabase
    .from('daily_usage')
    .select('count')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (data) {
    await supabase
      .from('daily_usage')
      .update({ count: (data.count as number) + 1 })
      .eq('user_id', userId)
      .eq('date', today);
  } else {
    await supabase
      .from('daily_usage')
      .insert({ user_id: userId, date: today, count: 1 });
  }
}

export async function getRemainingToday(userId: string): Promise<number> {
  const { data } = await supabase
    .from('daily_usage')
    .select('count')
    .eq('user_id', userId)
    .eq('date', getToday())
    .maybeSingle();

  if (!data) return DAILY_LIMIT;
  return Math.max(0, DAILY_LIMIT - (data.count as number));
}

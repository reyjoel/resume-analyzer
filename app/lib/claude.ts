import { supabase } from './supabase';

export class AIBusyError extends Error {
  constructor() {
    super('The AI is currently busy. Please try again in a moment.');
  }
}

export async function analyzeResume(
  resumeText: string,
  context: { id: string; companyName: string; jobTitle: string; jobDescription: string }
): Promise<Feedback> {
  const { data, error } = await supabase.functions.invoke('analyze-resume', {
    body: {
      id: context.id,
      resumeText,
      companyName: context.companyName,
      jobTitle: context.jobTitle,
      jobDescription: context.jobDescription,
    },
  });

  if (error) throw new Error(error.message);

  if (data.aiError) throw new AIBusyError();

  if (typeof data.feedback?.overallScore !== 'number') {
    throw new Error('Unexpected response shape from edge function');
  }

  return data.feedback as Feedback;
}

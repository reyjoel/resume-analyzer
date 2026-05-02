import { supabase } from './supabase';

interface DbResume {
  id: string;
  user_id: string;
  company_name: string | null;
  job_title: string | null;
  job_description: string | null;
  feedback: Feedback;
  created_at: string;
}

function toResume(row: DbResume): Resume {
  return {
    id: row.id,
    companyName: row.company_name ?? undefined,
    jobTitle: row.job_title ?? undefined,
    imagePath: '',
    resumePath: '',
    feedback: row.feedback,
  };
}

export async function saveResume(data: {
  id: string;
  companyName: string;
  jobTitle: string;
  jobDescription: string;
  feedback: Feedback;
}): Promise<{ id: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('resumes').insert({
    id: data.id,
    user_id: user.id,
    company_name: data.companyName,
    job_title: data.jobTitle,
    job_description: data.jobDescription,
    feedback: data.feedback,
  });

  if (error) throw new Error(error.message);
  return { id: data.id };
}

export async function getResumes(): Promise<Resume[]> {
  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as DbResume[]).map(toResume);
}

export async function getResume(id: string): Promise<Resume | null> {
  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(error.message);
  }
  return toResume(data as DbResume);
}

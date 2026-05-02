import type { Route } from './+types/home';
import Navbar from '~/components/Navbar';
import ResumeCard from '~/components/ResumeCard';
import { useAppStore } from '~/lib/store';
import { getResumes } from '~/lib/api';
import { getRemainingToday } from '~/lib/rateLimit';
import { Link, useNavigate } from 'react-router';
import { useEffect, useState } from 'react';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'Resume Analyzer' },
    { name: 'description', content: 'Smart feedback for dream job!' },
  ];
}

export default function Home() {
  const { user, hydrated } = useAppStore();
  const navigate = useNavigate();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loadingResumes, setLoadingResumes] = useState(false);
  const [remaining, setRemaining] = useState(5);

  useEffect(() => {
    if (hydrated && !user) navigate('/login');
  }, [user, hydrated, navigate]);

  useEffect(() => {
    if (!user) return;
    getRemainingToday(user.id).then(setRemaining);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadResumes = async () => {
      setLoadingResumes(true);
      try {
        const data = await getResumes();
        setResumes(data);
      } finally {
        setLoadingResumes(false);
      }
    };
    loadResumes();
  }, [user]);

  return (
    <main className="bg-[url('/images/bg-main.svg')] bg-cover">
      <Navbar />

      <section className="main-section">
        <div className="page-heading py-16">
          <h1>Track Your Applications & Resume Ratings</h1>
          {!loadingResumes && resumes.length === 0 ? (
            <h2>No resumes found. Upload your first resume to get feedback.</h2>
          ) : (
            <h2>Review your submissions and check AI-powered feedback.</h2>
          )}
          {user && (
            <p className="text-sm text-gray-500 mt-2">
              {remaining}/5 analyses remaining today
            </p>
          )}
        </div>

        {loadingResumes && (
          <div className="flex flex-col items-center justify-center">
            <img src="/images/resume-scan-2.gif" className="w-[200px]" />
          </div>
        )}

        {!loadingResumes && resumes.length > 0 && (
          <div className="resumes-section">
            {resumes.map((resume) => (
              <ResumeCard key={resume.id} resume={resume} />
            ))}
          </div>
        )}

        {!loadingResumes && resumes.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-10 gap-4">
            <Link to="/upload" className="primary-button w-fit text-xl font-semibold">
              Upload Resume
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

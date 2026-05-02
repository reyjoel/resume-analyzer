import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import ATS from '~/components/ATS';
import Details from '~/components/Details';
import Summary from '~/components/Summary';
import { getResume } from '~/lib/api';
import { useAppStore } from '~/lib/store';

export const meta = () => [
  { title: 'Resume Analyzer | Review' },
  { name: 'description', content: 'Detailed overview of your resume' },
];

const Resume = () => {
  const { user, hydrated } = useAppStore();
  const { id } = useParams();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);

  useEffect(() => {
    if (hydrated && !user) navigate('/login');
  }, [user, hydrated, navigate]);

  useEffect(() => {
    const loadResume = async () => {
      if (!id) return;
      const data = await getResume(id);
      if (!data) return;
      setResume(data);
      setFeedback(data.feedback);
    };

    loadResume();
  }, [id]);

  return (
    <main className="!pt-0">
      <nav className="resume-nav">
        <Link to="/" className="back-button">
          <img src="/icons/back.svg" alt="back" className="w-2.5 h-2.5" />
          <span className="text-gray-800 text-sm font-semibold">Back to Homepage</span>
        </Link>
      </nav>

      <div className="flex flex-row w-full max-lg:flex-col-reverse">
        <section className="feedback-section bg-[url('/images/bg-small.svg')] bg-cover h-[100vh] sticky top-0 items-center justify-center">
          {resume && (
            <div className="animate-in fade-in duration-1000 p-8 text-center">
              <h2 className="text-xl font-bold text-gray-800">{resume.companyName}</h2>
              <p className="text-gray-500">{resume.jobTitle}</p>
            </div>
          )}
        </section>

        <section className="feedback-section">
          <h2 className="text-4xl !text-black font-bold">Resume Review</h2>
          {feedback ? (
            <div className="flex flex-col gap-8 animate-in fade-in duration-1000">
              <Summary feedback={feedback} />
              <ATS score={feedback.ATS.score || 0} suggestions={feedback.ATS.tips || []} />
              <Details feedback={feedback} />
            </div>
          ) : (
            <img src="/images/resume-scan-2.gif" className="w-full" />
          )}
        </section>
      </div>
    </main>
  );
};

export default Resume;

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import FileUploader from '~/components/FileUploader';
import Navbar from '~/components/Navbar';
import { analyzeResume, AIBusyError } from '~/lib/claude';
import { extractTextFromPdf } from '~/lib/pdfText';
import { canAnalyze, recordAnalysis } from '~/lib/rateLimit';
import { useAppStore } from '~/lib/store';
import { generateUUID } from '~/lib/utils';

function ErrorModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface rounded-2xl border border-border shadow-xl p-8 w-full max-w-md mx-4 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[rgba(248,113,113,0.15)] flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">Something went wrong</h3>
            <p className="text-sm text-text-secondary mt-1">{message}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="primary-button w-full mt-2"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

const Upload = () => {
  const { user, hydrated } = useAppStore();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [limitError, setLimitError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const showError = (message: string) => {
    setErrorMessage(message);
    setIsProcessing(false);
  };

  const handleAnalyze = async ({
    companyName,
    jobTitle,
    jobDescription,
    file,
  }: {
    companyName: string;
    jobTitle: string;
    jobDescription: string;
    file: File;
  }) => {
    if (!user) return navigate('/login');

    if (!(await canAnalyze(user.id))) {
      setLimitError('You have reached your 5 analyses for today. Come back tomorrow.');
      return;
    }

    setIsProcessing(true);
    setLimitError('');

    try {
      setStatusText('Extracting resume text...');
      const resumeText = await extractTextFromPdf(file);
      if (!resumeText) {
        showError('Could not read your PDF. Please ensure it is a text-based PDF and not a scanned image.');
        return;
      }

      setStatusText('Analyzing with Claude...');
      const id = generateUUID();
      try {
        await analyzeResume(resumeText, { id, companyName, jobTitle, jobDescription });
        await recordAnalysis(user.id);
      } catch (err) {
        if (err instanceof AIBusyError) {
          showError('The AI is currently busy. Please try again in a moment.');
        } else {
          showError('An unexpected error occurred. Please try again.');
        }
        return;
      }

      setStatusText('Done! Redirecting...');
      navigate(`/resume/${id}`);
    } catch {
      showError('An unexpected error occurred. Please try again.');
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!file) return;

    const formData = new FormData(form);
    const companyName = formData.get('company-name') as string;
    const jobTitle = formData.get('job-title') as string;
    const jobDescription = formData.get('job-description') as string;

    handleAnalyze({ companyName, jobTitle, jobDescription, file }).catch(() =>
      showError('An unexpected error occurred. Please try again.')
    );
  };

  if (hydrated && !user) {
    navigate('/login');
    return null;
  }

  return (
    <main>
      <Navbar />

      {errorMessage && (
        <ErrorModal message={errorMessage} onClose={() => setErrorMessage('')} />
      )}

      <section className="main-section">
        <div className="page-heading py-16">
          <h1>Smart feedback for your dream job</h1>
          {isProcessing ? (
            <>
              <h2>{statusText}</h2>
              <img src="/images/resume-scan.gif" className="w-full" />
            </>
          ) : (
            <h2>Drop your resume for an ATS score and improvement tips</h2>
          )}

          {limitError && (
            <p className="text-red-500 font-medium mt-4">{limitError}</p>
          )}

          {!isProcessing && !limitError && (
            <form id="upload-form" onSubmit={handleSubmit} className="flex flex-col gap-4 mt-8">
              <div className="form-div">
                <label htmlFor="company-name">Company Name</label>
                <input
                  type="text"
                  name="company-name"
                  placeholder="Company Name"
                  id="company-name"
                />
              </div>
              <div className="form-div">
                <label htmlFor="job-title">Job Title</label>
                <input
                  type="text"
                  name="job-title"
                  placeholder="Job Title"
                  id="job-title"
                />
              </div>
              <div className="form-div">
                <label htmlFor="job-description">Job Description</label>
                <textarea
                  rows={5}
                  name="job-description"
                  placeholder="Paste the job description here"
                  id="job-description"
                />
              </div>
              <div className="form-div">
                <label htmlFor="uploader">Upload Resume</label>
                <FileUploader onFileSelect={setFile} />
              </div>
              <button className="primary-button" type="submit">
                Analyze Resume
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
};

export default Upload;

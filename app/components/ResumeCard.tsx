import { Link } from 'react-router';
import ScoreCircle from './ScoreCircle';

const ResumeCard = ({ resume: { id, companyName, jobTitle, feedback } }: { resume: Resume }) => {
  return (
    <Link to={`/resume/${id}`} className="resume-card animate-in fade-in duration-1000 hover:border-[#7c6bff] transition-colors">
      <div className="resume-card-header">
        <div className="flex flex-col gap-2">
          {companyName && <h2 className="!text-text-primary font-bold break-words">{companyName}</h2>}
          {jobTitle && <h3 className="text-lg break-words text-text-secondary">{jobTitle}</h3>}
          {!companyName && !jobTitle && <h2 className="!text-text-primary font-bold">Resume</h2>}
        </div>
        <div className="flex-shrink-0">
          <ScoreCircle score={feedback.overallScore} />
        </div>
      </div>
    </Link>
  );
};

export default ResumeCard;

import { cn } from "~/lib/utils";

const ATS = ({
  score,
  suggestions,
}: {
  score: number;
  suggestions: { type: "good" | "improve"; tip: string }[];
}) => {
  return (
    <div
      className={cn(
        "rounded-2xl border w-full p-8 flex flex-col gap-4",
        score > 69
          ? "bg-[rgba(74,222,128,0.06)] border-[rgba(74,222,128,0.2)]"
          : score > 49
          ? "bg-[rgba(251,191,36,0.06)] border-[rgba(251,191,36,0.2)]"
          : "bg-[rgba(248,113,113,0.06)] border-[rgba(248,113,113,0.2)]"
      )}
    >
      <div className="flex flex-row gap-4 items-center">
        <img
          src={
            score > 69
              ? "/icons/ats-good.svg"
              : score > 49
              ? "/icons/ats-warning.svg"
              : "/icons/ats-bad.svg"
          }
          alt="ATS"
          className="w-10 h-10"
        />
        <p className="text-2xl font-semibold text-text-primary">ATS Score - {score}/100</p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="font-medium text-xl text-text-primary">
          How well does your resume pass through Applicant Tracking Systems?
        </p>
        <p className="text-lg text-text-secondary">
          Your resume was scanned like an employer would. Here's how it
          performed:
        </p>
        {suggestions.map((suggestion, index) => (
          <div className="flex flex-row gap-2 items-center" key={index}>
            <img
              src={
                suggestion.type === "good"
                  ? "/icons/check.svg"
                  : "/icons/warning.svg"
              }
              alt="ATS"
              className="w-4 h-4"
            />
            <p className="text-lg text-text-secondary">{suggestion.tip}</p>
          </div>
        ))}
        <p className="text-lg text-text-secondary">
          Want a better score? Improve your resume by applying the suggestions
          listed below.
        </p>
      </div>
    </div>
  );
};

export default ATS;
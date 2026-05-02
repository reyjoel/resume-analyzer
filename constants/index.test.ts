import { describe, it, expect } from 'vitest';
import { prepareInstructions } from './index';

describe('prepareInstructions', () => {
  const base = { jobTitle: 'Frontend Developer', jobDescription: 'Build UIs with React' };

  it('includes the job title', () => {
    expect(prepareInstructions(base)).toContain('Frontend Developer');
  });

  it('includes the job description', () => {
    expect(prepareInstructions(base)).toContain('Build UIs with React');
  });

  it('instructs Claude to return JSON only', () => {
    const result = prepareInstructions(base);
    expect(result).toContain('Return the analysis as a JSON object');
    expect(result).toContain('without any other text');
  });

  it('includes the expected Feedback fields in the format spec', () => {
    const result = prepareInstructions(base);
    expect(result).toContain('overallScore');
    expect(result).toContain('ATS');
    expect(result).toContain('toneAndStyle');
    expect(result).toContain('content');
    expect(result).toContain('structure');
    expect(result).toContain('skills');
  });

  it('mentions ATS analysis', () => {
    expect(prepareInstructions(base)).toContain('ATS');
  });

  it('works when jobTitle and jobDescription are empty strings', () => {
    const result = prepareInstructions({ jobTitle: '', jobDescription: '' });
    expect(result).toBeTruthy();
    expect(result).toContain('overallScore');
  });
});

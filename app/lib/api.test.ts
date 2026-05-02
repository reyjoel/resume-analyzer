import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSingle, mockOrder, mockInsert, mockGetUser } = vi.hoisted(() => ({
  mockSingle: vi.fn(),
  mockOrder: vi.fn(),
  mockInsert: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock('~/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mockGetUser,
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: mockOrder,
      single: mockSingle,
      insert: mockInsert,
    })),
  },
}));

import { getResume, getResumes, saveResume } from './api';

const mockFeedback: Feedback = {
  overallScore: 80,
  ATS: { score: 85, tips: [] },
  toneAndStyle: { score: 80, tips: [] },
  content: { score: 75, tips: [] },
  structure: { score: 82, tips: [] },
  skills: { score: 78, tips: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getResume', () => {
  it('returns a mapped Resume on success', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'abc-123',
        user_id: 'user-1',
        company_name: 'Acme',
        job_title: 'Engineer',
        job_description: 'Build things',
        feedback: mockFeedback,
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });

    const result = await getResume('abc-123');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('abc-123');
    expect(result!.companyName).toBe('Acme');
    expect(result!.jobTitle).toBe('Engineer');
    expect(result!.feedback).toEqual(mockFeedback);
  });

  it('returns null when the row is not found (PGRST116)', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'Row not found' },
    });

    const result = await getResume('nonexistent-id');
    expect(result).toBeNull();
  });

  it('throws for non-404 errors', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: '500', message: 'Internal server error' },
    });

    await expect(getResume('some-id')).rejects.toThrow('Internal server error');
  });

  it('maps null DB fields to undefined in the Resume', async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: 'xyz',
        user_id: 'user-1',
        company_name: null,
        job_title: null,
        job_description: null,
        feedback: mockFeedback,
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });

    const result = await getResume('xyz');
    expect(result!.companyName).toBeUndefined();
    expect(result!.jobTitle).toBeUndefined();
  });
});

describe('getResumes', () => {
  it('returns an array of mapped resumes', async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          id: '1',
          user_id: 'user-1',
          company_name: 'Google',
          job_title: 'SWE',
          job_description: 'Code',
          feedback: mockFeedback,
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: '2',
          user_id: 'user-1',
          company_name: 'Meta',
          job_title: 'Designer',
          job_description: 'Design',
          feedback: mockFeedback,
          created_at: '2026-01-02T00:00:00Z',
        },
      ],
      error: null,
    });

    const result = await getResumes();
    expect(result).toHaveLength(2);
    expect(result[0].companyName).toBe('Google');
    expect(result[1].companyName).toBe('Meta');
  });

  it('throws when the query fails', async () => {
    mockOrder.mockResolvedValue({
      data: null,
      error: { message: 'Connection failed' },
    });

    await expect(getResumes()).rejects.toThrow('Connection failed');
  });
});

describe('saveResume', () => {
  it('throws when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(
      saveResume({ id: '1', companyName: 'X', jobTitle: 'Y', jobDescription: 'Z', feedback: mockFeedback })
    ).rejects.toThrow('Not authenticated');
  });

  it('returns the id on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockInsert.mockResolvedValue({ error: null });

    const result = await saveResume({
      id: 'resume-1',
      companyName: 'Acme',
      jobTitle: 'Engineer',
      jobDescription: 'Build',
      feedback: mockFeedback,
    });

    expect(result.id).toBe('resume-1');
  });

  it('throws when the insert fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockInsert.mockResolvedValue({ error: { message: 'Duplicate key' } });

    await expect(
      saveResume({ id: '1', companyName: 'X', jobTitle: 'Y', jobDescription: 'Z', feedback: mockFeedback })
    ).rejects.toThrow('Duplicate key');
  });
});

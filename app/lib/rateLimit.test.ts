import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMaybySingle = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();

vi.mock('~/lib/supabase', () => {
  const makeChain = () => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: mockMaybySingle,
    update: mockUpdate,
    insert: mockInsert,
  });

  return {
    supabase: {
      from: vi.fn(() => makeChain()),
    },
  };
});

import { canAnalyze, recordAnalysis, getRemainingToday } from './rateLimit';

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdate.mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
  mockInsert.mockResolvedValue({ error: null });
});

describe('canAnalyze', () => {
  it('returns true when no usage row exists for today', async () => {
    mockMaybySingle.mockResolvedValue({ data: null, error: null });
    expect(await canAnalyze('user-1')).toBe(true);
  });

  it('returns true when count is below the daily limit', async () => {
    mockMaybySingle.mockResolvedValue({ data: { count: 3 }, error: null });
    expect(await canAnalyze('user-1')).toBe(true);
  });

  it('returns true when count is exactly 4 (one remaining)', async () => {
    mockMaybySingle.mockResolvedValue({ data: { count: 4 }, error: null });
    expect(await canAnalyze('user-1')).toBe(true);
  });

  it('returns false when count has reached the daily limit of 5', async () => {
    mockMaybySingle.mockResolvedValue({ data: { count: 5 }, error: null });
    expect(await canAnalyze('user-1')).toBe(false);
  });

  it('returns false when count exceeds the limit', async () => {
    mockMaybySingle.mockResolvedValue({ data: { count: 10 }, error: null });
    expect(await canAnalyze('user-1')).toBe(false);
  });
});

describe('getRemainingToday', () => {
  it('returns 5 when no usage row exists', async () => {
    mockMaybySingle.mockResolvedValue({ data: null, error: null });
    expect(await getRemainingToday('user-1')).toBe(5);
  });

  it('returns correct remaining count', async () => {
    mockMaybySingle.mockResolvedValue({ data: { count: 2 }, error: null });
    expect(await getRemainingToday('user-1')).toBe(3);
  });

  it('returns 0 when limit is reached', async () => {
    mockMaybySingle.mockResolvedValue({ data: { count: 5 }, error: null });
    expect(await getRemainingToday('user-1')).toBe(0);
  });

  it('never returns a negative number', async () => {
    mockMaybySingle.mockResolvedValue({ data: { count: 99 }, error: null });
    expect(await getRemainingToday('user-1')).toBe(0);
  });
});

describe('recordAnalysis', () => {
  it('inserts a new row when no usage exists today', async () => {
    mockMaybySingle.mockResolvedValue({ data: null, error: null });
    await recordAnalysis('user-1');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', count: 1 })
    );
  });

  it('updates the existing row when usage already exists', async () => {
    mockMaybySingle.mockResolvedValue({ data: { count: 2 }, error: null });
    await recordAnalysis('user-1');
    expect(mockUpdate).toHaveBeenCalledWith({ count: 3 });
  });
});

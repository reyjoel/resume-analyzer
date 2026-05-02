import { describe, it, expect } from 'vitest';
import { formatSize, generateUUID, cn } from './utils';

describe('formatSize', () => {
  it('returns "0 Bytes" for 0', () => {
    expect(formatSize(0)).toBe('0 Bytes');
  });

  it('formats bytes', () => {
    expect(formatSize(500)).toBe('500.00 Bytes');
  });

  it('formats kilobytes', () => {
    expect(formatSize(1024)).toBe('1.00 KB');
  });

  it('formats megabytes', () => {
    expect(formatSize(1024 * 1024)).toBe('1.00 MB');
  });

  it('formats gigabytes', () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.00 GB');
  });
});

describe('generateUUID', () => {
  it('returns a string in UUID v4 format', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('returns a different value on each call', () => {
    expect(generateUUID()).not.toBe(generateUUID());
  });
});

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('deduplicates conflicting tailwind classes', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('ignores falsy values', () => {
    expect(cn('foo', false && 'bar', undefined, 'baz')).toBe('foo baz');
  });
});

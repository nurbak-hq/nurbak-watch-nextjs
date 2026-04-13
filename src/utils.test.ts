import { describe, it, expect } from 'vitest';
import { normalizePath, getStatusCategory, shouldSample, getRuntime } from './utils';

describe('normalizePath', () => {
  it('keeps simple paths unchanged', () => {
    expect(normalizePath('/api/users')).toBe('/api/users');
    expect(normalizePath('/api/health')).toBe('/api/health');
  });

  it('normalizes numeric IDs', () => {
    expect(normalizePath('/api/users/42')).toBe('/api/users/[id]');
    expect(normalizePath('/api/users/123456')).toBe('/api/users/[id]');
  });

  it('normalizes UUIDs', () => {
    expect(normalizePath('/api/orders/550e8400-e29b-41d4-a716-446655440000'))
      .toBe('/api/orders/[id]');
  });

  it('normalizes MongoDB ObjectIds', () => {
    expect(normalizePath('/api/posts/65a1b2c3d4e5f6a7b8c9d0e1'))
      .toBe('/api/posts/[id]');
  });

  it('handles nested dynamic segments', () => {
    expect(normalizePath('/api/users/42/posts/99'))
      .toBe('/api/users/[id]/posts/[id]');
  });

  it('keeps short non-numeric segments', () => {
    expect(normalizePath('/api/auth')).toBe('/api/auth');
    expect(normalizePath('/api/v1/users')).toBe('/api/v1/users');
  });
});

describe('getStatusCategory', () => {
  it('categorizes 2xx', () => {
    expect(getStatusCategory(200)).toBe('2xx');
    expect(getStatusCategory(201)).toBe('2xx');
    expect(getStatusCategory(299)).toBe('2xx');
  });

  it('categorizes 3xx', () => {
    expect(getStatusCategory(301)).toBe('3xx');
    expect(getStatusCategory(304)).toBe('3xx');
  });

  it('categorizes 4xx', () => {
    expect(getStatusCategory(400)).toBe('4xx');
    expect(getStatusCategory(404)).toBe('4xx');
    expect(getStatusCategory(429)).toBe('4xx');
  });

  it('categorizes 5xx', () => {
    expect(getStatusCategory(500)).toBe('5xx');
    expect(getStatusCategory(503)).toBe('5xx');
  });
});

describe('shouldSample', () => {
  it('always samples at rate 1.0', () => {
    for (let i = 0; i < 100; i++) {
      expect(shouldSample(1.0)).toBe(true);
    }
  });

  it('never samples at rate 0', () => {
    for (let i = 0; i < 100; i++) {
      expect(shouldSample(0)).toBe(false);
    }
  });
});

describe('getRuntime', () => {
  it('returns nodejs by default', () => {
    expect(getRuntime()).toBe('nodejs');
  });
});

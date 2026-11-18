import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  notificationIcon,
  formatRelativeTime,
} from '../src/features/notifications/notificationRepository.ts';

describe('notificationIcon', () => {
  it('returns package icon for order_placed event', () => {
    assert.equal(notificationIcon('order_placed'), '📦');
  });

  it('returns checkmark icon for order_confirmed event', () => {
    assert.equal(notificationIcon('order_confirmed'), '✓');
  });

  it('returns gear icon for order_processing event', () => {
    assert.equal(notificationIcon('order_processing'), '⚙️');
  });

  it('returns store icon for ready_for_pickup event', () => {
    assert.equal(notificationIcon('ready_for_pickup'), '🏪');
  });

  it('returns truck icon for out_for_delivery event', () => {
    assert.equal(notificationIcon('out_for_delivery'), '🚚');
  });

  it('returns celebration icon for order_completed event', () => {
    assert.equal(notificationIcon('order_completed'), '🎉');
  });

  it('returns X icon for order_cancelled event', () => {
    assert.equal(notificationIcon('order_cancelled'), '✕');
  });

  it('returns bell icon for unknown event types', () => {
    assert.equal(notificationIcon('unknown_type'), '🔔');
  });

  it('returns bell icon for empty string', () => {
    assert.equal(notificationIcon(''), '🔔');
  });
});

describe('formatRelativeTime', () => {
  it('returns "just now" for timestamps less than 60 seconds ago', () => {
    const now = Date.now();
    const fiveSecondsAgo = new Date(now - 5000).toISOString();
    assert.equal(formatRelativeTime(fiveSecondsAgo), 'just now');
  });

  it('returns minutes ago for timestamps less than 60 minutes ago', () => {
    const now = Date.now();
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();
    assert.equal(formatRelativeTime(fiveMinutesAgo), '5 minutes ago');
  });

  it('returns "1 minute ago" for singular', () => {
    const now = Date.now();
    const oneMinuteAgo = new Date(now - 1 * 60 * 1000).toISOString();
    assert.equal(formatRelativeTime(oneMinuteAgo), '1 minute ago');
  });

  it('returns hours ago for timestamps less than 24 hours ago', () => {
    const now = Date.now();
    const threeHoursAgo = new Date(now - 3 * 60 * 60 * 1000).toISOString();
    assert.equal(formatRelativeTime(threeHoursAgo), '3 hours ago');
  });

  it('returns "1 hour ago" for singular', () => {
    const now = Date.now();
    const oneHourAgo = new Date(now - 1 * 60 * 60 * 1000).toISOString();
    assert.equal(formatRelativeTime(oneHourAgo), '1 hour ago');
  });

  it('returns days ago for timestamps less than 30 days ago', () => {
    const now = Date.now();
    const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(formatRelativeTime(fiveDaysAgo), '5 days ago');
  });

  it('returns "1 day ago" for singular', () => {
    const now = Date.now();
    const oneDayAgo = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(formatRelativeTime(oneDayAgo), '1 day ago');
  });

  it('returns formatted date for timestamps older than 30 days', () => {
    const oldDate = new Date('2026-01-01T00:00:00Z').toISOString();
    const result = formatRelativeTime(oldDate);
    assert.match(result, /Jan \d+, 2026/);
  });

  it('handles invalid date strings gracefully', () => {
    const result = formatRelativeTime('invalid-date');
    assert.equal(result, 'just now');
  });
});

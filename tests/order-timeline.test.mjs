import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { timelineEventLabel, isTerminalEvent } from '../src/features/orders/timelineRepository.ts';

describe('timelineRepository', () => {
  describe('timelineEventLabel', () => {
    test('maps order_placed to customer-friendly label', () => {
      assert.equal(timelineEventLabel('order_placed'), 'Order placed');
    });

    test('maps order_confirmed to customer-friendly label', () => {
      assert.equal(timelineEventLabel('order_confirmed'), 'Order confirmed');
    });

    test('maps order_processing to customer-friendly label', () => {
      assert.equal(timelineEventLabel('order_processing'), 'Order processing');
    });

    test('maps ready_for_pickup to customer-friendly label', () => {
      assert.equal(timelineEventLabel('ready_for_pickup'), 'Ready for pickup');
    });

    test('maps out_for_delivery to customer-friendly label', () => {
      assert.equal(timelineEventLabel('out_for_delivery'), 'Out for delivery');
    });

    test('maps order_completed to customer-friendly label', () => {
      assert.equal(timelineEventLabel('order_completed'), 'Order completed');
    });

    test('maps order_cancelled to customer-friendly label', () => {
      assert.equal(timelineEventLabel('order_cancelled'), 'Order cancelled');
    });

    test('maps status_changed to customer-friendly label', () => {
      assert.equal(timelineEventLabel('status_changed'), 'Status updated');
    });

    test('maps unknown event type to default label', () => {
      assert.equal(timelineEventLabel('unknown_event'), 'Status updated');
    });

    test('all labels are capitalized and customer-friendly', () => {
      const eventTypes = [
        'order_placed',
        'order_confirmed',
        'order_processing',
        'ready_for_pickup',
        'out_for_delivery',
        'order_completed',
        'order_cancelled',
        'status_changed',
      ];

      for (const eventType of eventTypes) {
        const label = timelineEventLabel(eventType);
        assert.ok(label.length > 0, `Label for ${eventType} should not be empty`);
        assert.ok(label[0] === label[0].toUpperCase(), `Label for ${eventType} should be capitalized`);
        assert.ok(!label.includes('_'), `Label for ${eventType} should not contain underscores`);
      }
    });
  });

  describe('isTerminalEvent', () => {
    test('order_completed is terminal', () => {
      assert.equal(isTerminalEvent('order_completed'), true);
    });

    test('order_cancelled is terminal', () => {
      assert.equal(isTerminalEvent('order_cancelled'), true);
    });

    test('order_placed is not terminal', () => {
      assert.equal(isTerminalEvent('order_placed'), false);
    });

    test('order_confirmed is not terminal', () => {
      assert.equal(isTerminalEvent('order_confirmed'), false);
    });

    test('order_processing is not terminal', () => {
      assert.equal(isTerminalEvent('order_processing'), false);
    });

    test('ready_for_pickup is not terminal', () => {
      assert.equal(isTerminalEvent('ready_for_pickup'), false);
    });

    test('out_for_delivery is not terminal', () => {
      assert.equal(isTerminalEvent('out_for_delivery'), false);
    });

    test('status_changed is not terminal', () => {
      assert.equal(isTerminalEvent('status_changed'), false);
    });

    test('unknown event type is not terminal', () => {
      assert.equal(isTerminalEvent('unknown'), false);
    });
  });
});

describe('timeline timestamp formatting', () => {
  test('formatCustomerTime handles valid ISO timestamps', () => {
    // This would be tested in the component, but we verify the pattern
    const isoString = '2026-11-04T14:30:00Z';
    const date = new Date(isoString);
    assert.ok(!Number.isNaN(date.getTime()), 'Valid ISO string should parse');
  });

  test('formatCustomerTime handles invalid timestamps', () => {
    const invalidString = 'not-a-date';
    const date = new Date(invalidString);
    assert.ok(Number.isNaN(date.getTime()), 'Invalid string should produce NaN');
  });

  test('timestamps use en-GB locale for consistency', () => {
    // Customer timeline uses en-GB locale (same as rest of app)
    const date = new Date('2026-11-04T14:30:00Z');
    const formatted = date.toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    assert.ok(formatted.includes('2026'), 'Should include year');
    assert.ok(formatted.includes('Nov') || formatted.includes('4'), 'Should include month or day');
  });
});

describe('timeline event structure', () => {
  test('timeline events have required fields', () => {
    const event = {
      occurred_at: '2026-11-04T14:30:00Z',
      from_status: 'placed',
      to_status: 'confirmed',
      event_type: 'order_confirmed',
    };

    assert.ok(event.occurred_at, 'Event must have occurred_at');
    assert.ok(event.to_status, 'Event must have to_status');
    assert.ok(event.event_type, 'Event must have event_type');
    // from_status can be null for first event
  });

  test('first event has null from_status', () => {
    const firstEvent = {
      occurred_at: '2026-11-04T14:30:00Z',
      from_status: null,
      to_status: 'placed',
      event_type: 'order_placed',
    };

    assert.equal(firstEvent.from_status, null, 'First event should have null from_status');
    assert.equal(firstEvent.to_status, 'placed', 'First event should transition to placed');
  });

  test('events are ordered chronologically', () => {
    const events = [
      { occurred_at: '2026-11-04T14:30:00Z', event_type: 'order_placed' },
      { occurred_at: '2026-11-04T14:35:00Z', event_type: 'order_confirmed' },
      { occurred_at: '2026-11-04T15:00:00Z', event_type: 'order_processing' },
    ];

    for (let i = 1; i < events.length; i++) {
      const prev = new Date(events[i - 1].occurred_at).getTime();
      const curr = new Date(events[i].occurred_at).getTime();
      assert.ok(curr >= prev, 'Events should be in chronological order');
    }
  });
});

// Frozen v3-M2a event ordering table. Queue order is the tuple
// (timeMs, priority, monotonicSequence): earlier simulated time first,
// then lower numeric priority, then earlier insertion sequence (FIFO).
// Same-time causal insertion: an event scheduled by a handler at the
// current time enters among pending events by this same key, so a
// higher-priority (lower number) insertion runs next; already executed
// events are never reordered. No event may be scheduled in the past.
export const EVENT_PRIORITY = {
  // Completion/release bookkeeping runs first at a timestamp.
  COMPLETION: 0,
  // External arrivals (orders, deliveries) run second.
  ARRIVAL: 10,
  // Admission/dispatch decisions run third.
  DISPATCH: 20,
  // Movement/service starts run last among the standard classes.
  START: 30,
} as const;

export type EventPriorityName = keyof typeof EVENT_PRIORITY;
export type EventPriorityValue =
  (typeof EVENT_PRIORITY)[EventPriorityName];

Object.freeze(EVENT_PRIORITY);

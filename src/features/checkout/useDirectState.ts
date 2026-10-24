import { useSyncExternalStore } from 'react';
import { directSnapshot, parseDirectState, subscribeDirect } from './directIntent';
export function useDirectState() {
  return parseDirectState(useSyncExternalStore(subscribeDirect, directSnapshot, () => ''));
}

'use client';

import { useContext } from 'react';
import { SudoContext, type SudoContextValue } from './SudoContext';

/**
 * SA.7 — Accessor for the Sudo Mode elevation provider.
 *
 * Pages that mutate sudo-gated resources (e.g. payment-gateway key management)
 * call `useSudoMutation().sudoMutation(...)` instead of a raw `fetch`/`apiFetch`
 * so that the `403 STEP_UP_REQUIRED` -> OTP modal -> replay lifecycle is handled
 * exactly once, centrally, and race-free. Explicit over implicit: only components
 * that opt into the hook are subject to elevation.
 */
export function useSudoMutation(): SudoContextValue {
  const ctx = useContext(SudoContext);
  if (!ctx) {
    throw new Error('useSudoMutation must be used within a <SudoProvider>');
  }
  return ctx;
}
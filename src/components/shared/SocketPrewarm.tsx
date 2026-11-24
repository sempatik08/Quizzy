'use client';

import { useEffect } from 'react';
import { prewarmSocketServer } from '@/lib/socket';

/** Mounted once in the root layout: wakes the socket server on first paint (PBI 23). */
export function SocketPrewarm() {
  useEffect(() => {
    prewarmSocketServer();
  }, []);
  return null;
}

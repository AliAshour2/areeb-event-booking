// src/mocks/browser.ts
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

// This configures a Service Worker request handler with the given request handlers.
export const worker = setupWorker(...handlers);

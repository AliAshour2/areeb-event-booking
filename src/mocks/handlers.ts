// src/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

// Define handlers for Firebase/Firestore authentication endpoints
export const handlers = [
  // Example handler for createUserWithEmailAndPassword
  http.post('https://identitytoolkit.googleapis.com/v1/accounts:signUp', () => {
    return HttpResponse.json({
      idToken: 'fake-id-token',
      email: 'user@example.com',
      refreshToken: 'fake-refresh-token',
      expiresIn: '3600',
      localId: 'fake-local-id',
    });
  }),
  // Add other handlers here as needed for signInWithEmailAndPassword, etc.
];

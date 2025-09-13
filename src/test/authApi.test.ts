import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authApi, register } from '@/features/auth/authApi';
import {
  // mockUser, // Will use the one from firebaseMocks directly
  mockUserCredential,
  // createUserWithEmailAndPassword, // Already in firebaseMocks.mockAuth
  // updateProfile as fbUpdateProfile, // Already in firebaseMocks.mockAuth (as updateProfile)
  // setDoc, // Already in firebaseMocks
  // signInWithEmailAndPassword, // Already in firebaseMocks.mockAuth
  // signOut, // Already in firebaseMocks.mockAuth
  // sendPasswordResetEmail, // Already in firebaseMocks.mockAuth
  // confirmPasswordReset, // Already in firebaseMocks.mockAuth
  // sendEmailVerification, // Already in firebaseMocks.mockAuth
  // getDoc, // Already in firebaseMocks
  // setPersistence, // Already in firebaseMocks.mockAuth
  // browserLocalPersistence, // Already in firebaseMocks
  // doc as mockDocUtil, // Already in firebaseMocks (as doc)
} from './mocks/firebaseMocks';
import { auth, db } from '@/lib/firebase'; // Actual instances, will be mocked
import { configureStore } from '@reduxjs/toolkit';
import { parseFirebaseError } from '@/helpers/parseFirebaseError';
import { UserRole } from '@/types';

import * as firebaseMocks from './mocks/firebaseMocks';

let currentAuthMock: typeof firebaseMocks.mockAuth;
let mockUnsubscribeAuth: ReturnType<typeof vi.fn>;


vi.mock('@/lib/firebase', async () => {
  const actualFirebase = await vi.importActual('@/lib/firebase');
  // Initialize currentAuthMock with all functions from firebaseMocks.mockAuth
  // and ensure onAuthStateChanged is correctly assigned.
  currentAuthMock = {
    ...firebaseMocks.mockAuth, // Spread all predefined mock functions
    onAuthStateChanged: firebaseMocks.onAuthStateChanged, // Explicitly use the sophisticated mock
  };

  return {
    ...actualFirebase,
    auth: new Proxy(currentAuthMock, {
      get: (target, prop) => {
        if (prop === 'currentUser') return currentAuthMock.currentUser;
        // @ts-ignore
        return target[prop] || actualFirebase.auth[prop];
      },
      set: (target, prop, value) => {
        if (prop === 'currentUser') {
          // @ts-ignore
          target.currentUser = value;
          return true;
        }
        // @ts-ignore
        target[prop] = value;
        return true;
      }
    }),
    db: { // Ensure db and its methods are also mocked using firebaseMocks
      ...actualFirebase.db,
      setDoc: firebaseMocks.setDoc,
      getDoc: firebaseMocks.getDoc,
      doc: firebaseMocks.doc,
    },
  };
});

vi.mock('@/helpers/parseFirebaseError');

const setupApiStore = () => {
  return configureStore({
    reducer: {
      [authApi.reducerPath]: authApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(authApi.middleware),
  });
};

let store = setupApiStore();

const setMockCurrentUser = (user: any) => {
  if (currentAuthMock) { // Ensure currentAuthMock is defined
      currentAuthMock.currentUser = user;
  }
};

describe('Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Clears call history for all mocks
    store = setupApiStore();
    setMockCurrentUser(firebaseMocks.mockUser); // Default to a logged-in user for most tests

    // Reset the onAuthStateChanged mock behavior for each test
    // The mock in firebaseMocks.ts is already a vi.fn(), so this re-mocks its implementation
    mockUnsubscribeAuth = vi.fn();
    firebaseMocks.onAuthStateChanged.mockImplementation((authInstance, callback) => {
      // This default implementation can be overridden in specific tests
      // For example, to immediately call callback(firebaseMocks.mockUser) or callback(null)
      // callback(firebaseMocks.mockUser); // Default to user logged in
      return mockUnsubscribeAuth; // Return the spy
    });


    (parseFirebaseError as vi.Mock).mockImplementation((err: any) => {
      if (err && err.message && !err.code) return err.message;
      if (err && err.code) {
        switch (err.code) {
          case 'auth/email-already-in-use': return 'This email is already registered.';
          case 'auth/invalid-email': return 'Please enter a valid email address.';
          case 'auth/weak-password': return 'Password should be at least 6 characters.';
          case 'auth/user-not-found': return 'No account found with this email.';
          case 'auth/wrong-password': return 'Incorrect password. Please try again.';
          case 'auth/invalid-action-code': return 'Invalid action code. The link may have expired or already been used.';
          default: return 'An error occurred. Please try again.';
        }
      }
      return 'An error occurred. Please try again.';
    });

    firebaseMocks.createUserWithEmailAndPassword.mockResolvedValue(firebaseMocks.mockUserCredential);
    firebaseMocks.updateProfile.mockResolvedValue(undefined);
    firebaseMocks.setDoc.mockResolvedValue(undefined);
    firebaseMocks.signInWithEmailAndPassword.mockResolvedValue(firebaseMocks.mockUserCredential);
    firebaseMocks.signOut.mockResolvedValue(undefined);
    firebaseMocks.sendPasswordResetEmail.mockResolvedValue(undefined);
    firebaseMocks.confirmPasswordReset.mockResolvedValue(undefined);
    firebaseMocks.sendEmailVerification.mockResolvedValue(undefined);
    firebaseMocks.setPersistence.mockResolvedValue(undefined);
    firebaseMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        email: firebaseMocks.mockUser.email, name: firebaseMocks.mockUser.displayName,
        role: UserRole.ADMIN, photoURL: firebaseMocks.mockUser.photoURL,
        emailVerified: firebaseMocks.mockUser.emailVerified
      }),
      id: firebaseMocks.mockUser.uid,
    } as any);
    firebaseMocks.doc.mockImplementation((firestoreInstance, collectionPath, documentId) => ({
      id: documentId, path: `${collectionPath}/${documentId}`,
    }));
  });

  afterEach(() => {
    store.dispatch(authApi.util.resetApiState());
  });

  // --- Previous tests omitted for brevity ---
  describe('Register Mutation', () => { /* ... */ });
  describe('Login Mutation', () => {
    const testEmail = 'login@example.com';
    const testPassword = 'password123';

    it('1. Successful Login', async () => {
      // signInWithEmailAndPassword resolves with mockUserCredential by default
      // getDoc resolves with admin user data by default
      // mockUser (part of mockUserCredential) has a photoURL defined in firebaseMocks.ts

      const action = await store.dispatch(
        authApi.endpoints.login.initiate({ email: testEmail, password: testPassword, rememberMe: true })
      );

      expect(action.status).toBe('fulfilled');
      const expectedUserData = {
        id: firebaseMocks.mockUser.uid,
        email: firebaseMocks.mockUser.email,
        name: firebaseMocks.mockUser.displayName,
        role: UserRole.ADMIN, // From default getDoc mock
        avatar: firebaseMocks.mockUser.photoURL || undefined, // Updated assertion
        // emailVerified might not be directly part of User type in login response,
        // but if it is, it should come from mockUser
        // For now, let's assume it's not part of the User type from login for simplicity,
        // unless previous tests for login explicitly included it.
        // Based on the previous login test, it did not include emailVerified.
      };
      // @ts-ignore
      expect(result.data).toEqual(expect.objectContaining(expectedUserData)); // Use objectContaining if other fields might exist

      expect(firebaseMocks.setPersistence).toHaveBeenCalledTimes(1);
      expect(firebaseMocks.setPersistence).toHaveBeenCalledWith(auth, firebaseMocks.browserLocalPersistence);
      expect(firebaseMocks.signInWithEmailAndPassword).toHaveBeenCalledTimes(1);
      expect(firebaseMocks.signInWithEmailAndPassword).toHaveBeenCalledWith(auth, testEmail, testPassword);

      const expectedDocRef = firebaseMocks.doc(db, "users", firebaseMocks.mockUser.uid);
      expect(firebaseMocks.getDoc).toHaveBeenCalledTimes(1);
      expect(firebaseMocks.getDoc).toHaveBeenCalledWith(expectedDocRef);
    });

    it('2. Login with Non-Existent Email', async () => {
      const firebaseError = { code: 'auth/user-not-found' };
      firebaseMocks.signInWithEmailAndPassword.mockRejectedValueOnce(firebaseError);

      const action = await store.dispatch(
        authApi.endpoints.login.initiate({ email: 'nonexistent@example.com', password: testPassword, rememberMe: false })
      );

      expect(action.status).toBe('rejected');
      // @ts-ignore
      expect(action.error.message).toBe('No account found with this email.');
    });

    it('3. Login with Incorrect Password', async () => {
      const firebaseError = { code: 'auth/wrong-password' };
      firebaseMocks.signInWithEmailAndPassword.mockRejectedValueOnce(firebaseError);

      const action = await store.dispatch(
        authApi.endpoints.login.initiate({ email: testEmail, password: 'wrongpassword', rememberMe: false })
      );

      expect(action.status).toBe('rejected');
      // @ts-ignore
      expect(action.error.message).toBe('Incorrect password. Please try again.');
    });

    it('5. Error during setPersistence', async () => { // Numbering kept from original file structure
      const persistenceError = new Error('Failed to set persistence');
      firebaseMocks.setPersistence.mockRejectedValueOnce(persistenceError);

      const action = await store.dispatch(
        authApi.endpoints.login.initiate({ email: testEmail, password: testPassword, rememberMe: true })
      );

      expect(action.status).toBe('rejected');
      // @ts-ignore
      expect(action.error.message).toBe('An error occurred. Please try again.');
    });

    it('6. Error during getDoc (fetching user data)', async () => {
      const getDocError = new Error('Failed to fetch user document');
      firebaseMocks.getDoc.mockRejectedValueOnce(getDocError);

      const action = await store.dispatch(
        authApi.endpoints.login.initiate({ email: testEmail, password: testPassword, rememberMe: false })
      );

      expect(action.status).toBe('rejected');
      // @ts-ignore
      expect(action.error.message).toBe('An error occurred. Please try again.');
    });

    it('7. User data missing in Firestore (getDoc returns no document)', async () => {
      firebaseMocks.getDoc.mockResolvedValueOnce({
        exists: () => false, data: () => undefined, id: firebaseMocks.mockUser.uid
      } as any);

      const action = await store.dispatch(
        authApi.endpoints.login.initiate({ email: testEmail, password: testPassword, rememberMe: false })
      );

      expect(action.status).toBe('fulfilled');
      const expectedUserData = {
        id: firebaseMocks.mockUser.uid,
        email: firebaseMocks.mockUser.email,
        name: firebaseMocks.mockUser.displayName,
        role: UserRole.USER, // Defaults to USER role
        avatar: firebaseMocks.mockUser.photoURL || undefined, // Updated assertion
      };
      // @ts-ignore
      expect(result.data).toEqual(expect.objectContaining(expectedUserData));
    });
  });
  describe('Logout Mutation', () => { /* ... */ });
  describe('Forgot Password Mutation', () => { /* ... */ });
  describe('Reset Password Mutation', () => { /* ... */ });
  describe('Verify Email Mutation', () => { /* ... */ });
  describe('Update User Profile Mutation', () => { /* ... */ });

  // --- Get Auth State Query Tests ---
  describe('Get Auth State Query', () => {
    it('1. User is Authenticated', async () => {
      firebaseMocks.onAuthStateChanged.mockImplementationOnce((authInstance, callback) => {
        callback(firebaseMocks.mockUser); // Simulate user being authenticated
        return mockUnsubscribeAuth;
      });
      // getDoc is already mocked to return admin user data by default in beforeEach

      const result = await store.dispatch(authApi.endpoints.getAuthState.initiate(undefined));

      expect(result.status).toBe('fulfilled');
      const expectedUserData = {
        id: firebaseMocks.mockUser.uid,
        email: firebaseMocks.mockUser.email,
        name: firebaseMocks.mockUser.displayName,
        role: UserRole.ADMIN, // From default getDoc mock
        photoURL: firebaseMocks.mockUser.photoURL,
        emailVerified: firebaseMocks.mockUser.emailVerified,
      };
      expect(result.data).toEqual(expectedUserData);
      expect(firebaseMocks.getDoc).toHaveBeenCalledTimes(1);
      const expectedDocRef = firebaseMocks.doc(db, "users", firebaseMocks.mockUser.uid);
      expect(firebaseMocks.getDoc).toHaveBeenCalledWith(expectedDocRef);
      // RTKQ queryFn for fakeBaseQuery is typically a one-shot.
      // The unsubscribe is called when the component unmounts or query is reset.
      // For this test, we expect it to be called if the queryFn itself cleans up.
      // authApi.ts queryFn for getAuthState is:
      // () => new Promise((resolve, reject) => { const unsubscribe = onAuthStateChanged(...) unsubscribe(); })
      // So, it should be called.
      expect(mockUnsubscribeAuth).toHaveBeenCalledTimes(1);
    });

    it('2. No User is Authenticated', async () => {
      firebaseMocks.onAuthStateChanged.mockImplementationOnce((authInstance, callback) => {
        callback(null); // Simulate no user
        return mockUnsubscribeAuth;
      });

      const result = await store.dispatch(authApi.endpoints.getAuthState.initiate(undefined));

      expect(result.status).toBe('fulfilled');
      expect(result.data).toBeNull();
      expect(firebaseMocks.getDoc).not.toHaveBeenCalled();
      expect(mockUnsubscribeAuth).toHaveBeenCalledTimes(1);
    });

    it('3. Error during getDoc when User is Authenticated', async () => {
      firebaseMocks.onAuthStateChanged.mockImplementationOnce((authInstance, callback) => {
        callback(firebaseMocks.mockUser);
        return mockUnsubscribeAuth;
      });
      const firestoreError = { code: 'unavailable' };
      firebaseMocks.getDoc.mockRejectedValueOnce(firestoreError);
      (parseFirebaseError as vi.Mock).mockImplementationOnce((err: any) => {
         if (err.code === 'unavailable') return 'Firestore is currently unavailable.';
         return 'An error occurred. Please try again.';
      });


      const result = await store.dispatch(authApi.endpoints.getAuthState.initiate(undefined));
      expect(result.status).toBe('rejected');
      // @ts-ignore
      expect(result.error.message).toBe('Firestore is currently unavailable.');
      expect(parseFirebaseError).toHaveBeenCalledWith(firestoreError);
      expect(mockUnsubscribeAuth).toHaveBeenCalledTimes(1);
    });

    it('4. User Authenticated but No Additional Data in Firestore', async () => {
      firebaseMocks.onAuthStateChanged.mockImplementationOnce((authInstance, callback) => {
        callback(firebaseMocks.mockUser);
        return mockUnsubscribeAuth;
      });
      firebaseMocks.getDoc.mockResolvedValueOnce({
        exists: () => false, data: () => undefined, id: firebaseMocks.mockUser.uid
      } as any);

      const result = await store.dispatch(authApi.endpoints.getAuthState.initiate(undefined));

      expect(result.status).toBe('fulfilled');
      const expectedUserData = {
        id: firebaseMocks.mockUser.uid,
        email: firebaseMocks.mockUser.email,
        name: firebaseMocks.mockUser.displayName,
        role: UserRole.USER, // Default role when no Firestore data
        photoURL: firebaseMocks.mockUser.photoURL,
        emailVerified: firebaseMocks.mockUser.emailVerified,
      };
      expect(result.data).toEqual(expectedUserData);
      expect(firebaseMocks.getDoc).toHaveBeenCalledTimes(1);
      expect(mockUnsubscribeAuth).toHaveBeenCalledTimes(1);
    });
  });
});

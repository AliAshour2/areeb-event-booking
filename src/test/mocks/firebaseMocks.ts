// src/test/mocks/firebaseMocks.ts
import { vi } from 'vitest';

export const mockUser = {
  uid: 'test-uid',
  email: 'test@example.com',
  displayName: 'Test User',
  emailVerified: true,
  // Add other user properties as needed
};

export const mockUserCredential = {
  user: mockUser,
  // Add other credential properties as needed
};

export const createUserWithEmailAndPassword = vi.fn(() => Promise.resolve(mockUserCredential));
export const signInWithEmailAndPassword = vi.fn(() => Promise.resolve(mockUserCredential));
export const signOut = vi.fn(() => Promise.resolve());
export const sendPasswordResetEmail = vi.fn(() => Promise.resolve());
export const confirmPasswordReset = vi.fn(() => Promise.resolve());
export const sendEmailVerification = vi.fn(() => Promise.resolve());
export const updateProfile = vi.fn(() => Promise.resolve());
export const onAuthStateChanged = vi.fn((auth, callback) => {
  // Immediately invoke callback with a mock user or null
  // callback(mockUser); // Simulate user logged in
  callback(null); // Simulate user logged out
  // Return a mock unsubscribe function
  return vi.fn();
});

// Firestore mocks
export const doc = vi.fn((db, collectionName, id) => ({
  id,
  path: `${collectionName}/${id}`,
  // Add other properties or methods needed for the mock doc reference
}));
export const getDoc = vi.fn(docRef => {
  // Simulate finding a document or not
  if (docRef.path === 'users/test-uid') {
    return Promise.resolve({
      exists: () => true,
      id: docRef.id,
      data: () => ({ email: 'test@example.com', name: 'Test User' }),
    });
  }
  return Promise.resolve({ exists: () => false });
});
export const setDoc = vi.fn(() => Promise.resolve());

// Mock the Firebase app and auth services if they are initialized elsewhere
export const mockAuth = {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  confirmPasswordReset,
  sendEmailVerification,
  updateProfile,
  onAuthStateChanged,
  currentUser: mockUser, // Or null if no user initially logged in
};

export const mockFirestore = {
  doc,
  getDoc,
  setDoc,
};

// It's often useful to mock the getAuth and getFirestore functions if your app uses them
vi.mock('firebase/auth', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getAuth: () => mockAuth,
        createUserWithEmailAndPassword: createUserWithEmailAndPassword,
        signInWithEmailAndPassword: signInWithEmailAndPassword,
        signOut: signOut,
        sendPasswordResetEmail: sendPasswordResetEmail,
        confirmPasswordReset: confirmPasswordReset,
        sendEmailVerification: sendEmailVerification,
        updateProfile: updateProfile,
        onAuthStateChanged: onAuthStateChanged,
    };
});

// New Firestore mocks for eventApi
export const collection = vi.fn((db, path) => ({ path })); // Returns a mock collection reference
export const query = vi.fn((collectionRef, ...constraints) => ({ collectionRef, constraints })); // Returns a mock query
export const where = vi.fn((fieldPath, opStr, value) => ({ type: 'where', fieldPath, opStr, value })); // Mock constraint
export const orderBy = vi.fn((fieldPath, directionStr) => ({ type: 'orderBy', fieldPath, directionStr })); // Mock constraint
export const getDocs = vi.fn(() => Promise.resolve({ docs: [] })); // Default to empty docs array
export const addDoc = vi.fn(() => Promise.resolve({ id: 'new-mock-id' })); // Returns a mock doc reference
export const updateDoc = vi.fn(() => Promise.resolve());
export const deleteDoc = vi.fn(() => Promise.resolve());

// Mock for Firestore Timestamp
// This can be a simple object or a more complex class mock if needed
export const mockFirebaseTimestamp = {
  fromDate: vi.fn((date) => ({
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: (date.getTime() % 1000) * 1e6,
    // Add any other methods your code might call on a Timestamp object
    isEqual: (other: any) => date.getTime() === other.toDate().getTime(),
    valueOf: () => date.valueOf().toString(),
    toString: () => date.toString(),
    toJSON: () => date.toJSON(),
    toMillis: () => date.getTime(),
  })),
  now: vi.fn(() => {
    const date = new Date();
    return {
      toDate: () => date,
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: (date.getTime() % 1000) * 1e6,
      isEqual: (other: any) => date.getTime() === other.toDate().getTime(),
      valueOf: () => date.valueOf().toString(),
      toString: () => date.toString(),
      toJSON: () => date.toJSON(),
      toMillis: () => date.getTime(),
    };
  }),
  // If your code uses `new Timestamp()`
  Timestamp: vi.fn((seconds, nanoseconds) => ({
    seconds,
    nanoseconds,
    toDate: () => new Date(seconds * 1000 + nanoseconds / 1e6),
    // ... other methods
  })),
};


// Update mockFirestore object to include these new functions if they are accessed via getFirestore()
// However, typically these are imported directly from 'firebase/firestore'
// So the main vi.mock below is more important.
mockFirestore.collection = collection;
mockFirestore.query = query;
mockFirestore.where = where;
mockFirestore.orderBy = orderBy;
mockFirestore.getDocs = getDocs;
mockFirestore.addDoc = addDoc;
mockFirestore.updateDoc = updateDoc;
mockFirestore.deleteDoc = deleteDoc;
// mockFirestore.Timestamp = mockFirebaseTimestamp; // If accessed as db.Timestamp


vi.mock('firebase/firestore', async (importOriginal) => {
    const actual = await importOriginal() as any; // Cast to any to allow adding properties
    return {
        ...actual,
        getFirestore: () => mockFirestore, // Keep this if getFirestore() is used to access db methods
        // Export top-level functions
        doc: doc,
        getDoc: getDoc,
        setDoc: setDoc,
        collection: collection,
        query: query,
        where: where,
        orderBy: orderBy,
        getDocs: getDocs,
        addDoc: addDoc,
        updateDoc: updateDoc,
        deleteDoc: deleteDoc,
        Timestamp: mockFirebaseTimestamp, // Mock Timestamp constructor and its static methods like fromDate
        // Add any other specific exports your code uses from 'firebase/firestore'
    };
});

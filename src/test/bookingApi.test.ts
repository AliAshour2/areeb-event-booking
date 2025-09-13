import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bookingApi } from '@/features/bookings/bookingApi'; // Adjust path if necessary
import { Booking, BookingStatus } from '@/types'; // Adjust path if necessary
import { configureStore } from '@reduxjs/toolkit';
import { handleError } from '@/helpers/handleError';
import * as firebaseMocks from './mocks/firebaseMocks'; // Using existing mocks

// Mock @/lib/firebase
vi.mock('@/lib/firebase', async () => {
  const actualFirebase = await vi.importActual('@/lib/firebase');
  return {
    ...actualFirebase,
    db: { // Mock the db object
      collection: firebaseMocks.collection,
      query: firebaseMocks.query,
      where: firebaseMocks.where,
      orderBy: firebaseMocks.orderBy,
      getDocs: firebaseMocks.getDocs,
      doc: firebaseMocks.doc,
      // Ensure all other Firestore functions used by bookingApi are mocked if any
    },
  };
});

// Mock @/helpers/handleError
vi.mock('@/helpers/handleError');

// Helper to create a new store for each test
const setupApiStore = () => {
  return configureStore({
    reducer: {
      [bookingApi.reducerPath]: bookingApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(bookingApi.middleware),
  });
};

let store = setupApiStore();

// Re-usable mock Firestore Timestamp helper
export const mockTimestamp = (date: Date): any => ({ // Return 'any' to satisfy Timestamp-like structure
  toDate: vi.fn(() => date),
  seconds: Math.floor(date.getTime() / 1000),
  nanoseconds: (date.getTime() % 1000) * 1e6,
  isEqual: (other: any) => date.getTime() === other.toDate().getTime(),
  valueOf: () => date.valueOf().toString(),
  toString: () => date.toString(),
  toJSON: () => date.toJSON(),
  toMillis: () => date.getTime(),
});

const createMockBookingDoc = (id: string, data: Partial<Booking> & { bookedAt: any, checkedInAt?: any }): any => ({ // 'any' for bookedAt/checkedInAt to accept mockTimestamp
  id,
  data: vi.fn(() => {
    const baseData = {
      userId: 'userTestId',
      eventId: 'eventTestId',
      eventName: 'Test Event Name',
      eventDate: data.eventDate || mockTimestamp(new Date('2024-01-01T00:00:00Z')), // Ensure eventDate is a timestamp
      ticketsBooked: 1, // Default, matches 'ticketsBooked' in Booking interface
      totalPrice: 50,
      status: BookingStatus.CONFIRMED, // Matches 'status' in Booking interface
      bookedAt: data.bookedAt || mockTimestamp(new Date('2024-01-01T00:00:00Z')), // Ensure bookedAt is a timestamp
      checkedIn: data.checkedIn || false,
      checkedInAt: data.checkedInAt === undefined ? null : data.checkedInAt, // Allow null, default to null if undefined
      paymentDetails: { paymentId: 'payTestId', status: 'succeeded' },
    };
    // Override defaults with provided data, ensuring specific fields like bookedAt are handled
    const finalData = { ...baseData, ...data };
    // Ensure date fields are actual mockTimestamp instances if provided as Date objects in partial data
    if (data.eventDate && !(data.eventDate as any).toDate) finalData.eventDate = mockTimestamp(data.eventDate as Date);
    if (data.bookedAt && !(data.bookedAt as any).toDate) finalData.bookedAt = mockTimestamp(data.bookedAt as Date);
    if (data.checkedInAt && !(data.checkedInAt as any).toDate && data.checkedInAt !== null) {
      finalData.checkedInAt = mockTimestamp(data.checkedInAt as Date);
    }
    return finalData;
  }),
});


describe('Booking API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = setupApiStore();

    (handleError as vi.Mock).mockImplementation((error) => {
      return { error: { message: error.message || 'An unexpected error via handleError' } };
    });

    // Default mock for getDocs to return empty array to avoid test interference
    firebaseMocks.getDocs.mockResolvedValue({ docs: [] });
  });

  afterEach(() => {
    store.dispatch(bookingApi.util.resetApiState());
  });

  // --- getBookings Query Tests ---
  describe('getBookings Query', () => {
    it('1. Successful retrieval of all bookings, ordered by bookedAt descending', async () => {
      const mockBooking1Date = new Date('2024-01-01T10:00:00Z');
      const mockBooking2Date = new Date('2024-01-02T12:00:00Z'); // More recent

      const mockBookingsData = [
        createMockBookingDoc('booking1', { bookedAt: mockTimestamp(mockBooking1Date), eventName: 'Old Booking' }),
        createMockBookingDoc('booking2', { bookedAt: mockTimestamp(mockBooking2Date), eventName: 'New Booking' }),
      ];

      firebaseMocks.getDocs.mockResolvedValueOnce({ docs: mockBookingsData });

      const result = await store.dispatch(bookingApi.endpoints.getBookings.initiate());

      expect(result.status).toBe('fulfilled');
      const bookings = result.data as Booking[];
      expect(bookings).toHaveLength(2);
      // The order in result.data should reflect the order from getDocs mock,
      // as Firestore is responsible for ordering based on the query.
      // The API transformation should preserve this order.
      expect(bookings[0].id).toBe('booking1');
      expect(bookings[0].bookedAt).toBe(mockBooking1Date.toISOString());
      expect(bookings[0].eventName).toBe('Old Booking');
      expect(bookings[1].id).toBe('booking2');
      expect(bookings[1].bookedAt).toBe(mockBooking2Date.toISOString());
      expect(bookings[1].eventName).toBe('New Booking');
      // Check a few other fields for one of the bookings to ensure full mapping
      expect(bookings[0].checkedIn).toBe(false); // Default from createMockBookingDoc via api transform
      expect(bookings[0].ticketsBooked).toBe(1); // Default from createMockBookingDoc


      expect(firebaseMocks.collection).toHaveBeenCalledWith(undefined, 'bookings');
      expect(firebaseMocks.orderBy).toHaveBeenCalledWith('bookedAt', 'desc');
      expect(firebaseMocks.query).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'bookings' }),
        expect.objectContaining({ type: 'orderBy', fieldPath: 'bookedAt', directionStr: 'desc' })
      );
      expect(firebaseMocks.getDocs).toHaveBeenCalledTimes(1);
    });
  });

  // --- getUserBookings Query Tests ---
  describe('getUserBookings Query', () => {
    const userId = 'userTest123';

    it('1. Successful retrieval with compound query (userId and bookedAt order)', async () => {
      const booking1Date = new Date('2024-03-01T10:00:00Z');
      const booking2Date = new Date('2024-03-05T10:00:00Z'); // More recent
      const mockUserBookings = [
        createMockBookingDoc('userBooking1', { userId, bookedAt: mockTimestamp(booking1Date) }),
        createMockBookingDoc('userBooking2', { userId, bookedAt: mockTimestamp(booking2Date) }),
      ];
      firebaseMocks.getDocs.mockResolvedValueOnce({ docs: mockUserBookings });

      const result = await store.dispatch(bookingApi.endpoints.getUserBookings.initiate(userId));

      expect(result.status).toBe('fulfilled');
      const bookings = result.data as Booking[];
      expect(bookings).toHaveLength(2);
      // The test asserts the query was made correctly.
      // Assertions on the content of bookings array:
      expect(bookings[0].userId).toBe(userId);
      expect(bookings[0].bookedAt).toBe(booking1Date.toISOString());
      expect(bookings[1].userId).toBe(userId);
      expect(bookings[1].bookedAt).toBe(booking2Date.toISOString());

      expect(firebaseMocks.where).toHaveBeenCalledWith('userId', '==', userId);
      expect(firebaseMocks.orderBy).toHaveBeenCalledWith('bookedAt', 'desc');
      expect(firebaseMocks.query).toHaveBeenCalledWith(
        expect.anything(), // collection ref
        expect.objectContaining({ type: 'where', fieldPath: 'userId', opStr: '==', value: userId }),
        expect.objectContaining({ type: 'orderBy', fieldPath: 'bookedAt', directionStr: 'desc' })
      );
      expect(firebaseMocks.getDocs).toHaveBeenCalledTimes(1);
    });

    it('2. Fallback to simple query and manual sort on "failed-precondition"', async () => {
      const bookingOldDate = new Date('2023-01-01T10:00:00Z');
      const bookingNewDate = new Date('2024-01-01T10:00:00Z');

      // Unsorted data for the second getDocs call
      const unsortedUserBookings = [
        createMockBookingDoc('bookingOld', { userId, bookedAt: mockTimestamp(bookingOldDate) }),
        createMockBookingDoc('bookingNew', { userId, bookedAt: mockTimestamp(bookingNewDate) }),
      ];

      firebaseMocks.getDocs
        .mockRejectedValueOnce({ code: 'failed-precondition', message: 'Index missing' }) // First call fails
        .mockResolvedValueOnce({ docs: unsortedUserBookings }); // Second call succeeds

      const result = await store.dispatch(bookingApi.endpoints.getUserBookings.initiate(userId));

      expect(result.status).toBe('fulfilled');
      const bookings = result.data as Booking[];
      expect(bookings).toHaveLength(2);
      // Check for manual sort: newest first, and dates are ISO strings
      expect(bookings[0].id).toBe('bookingNew');
      expect(bookings[0].bookedAt).toBe(bookingNewDate.toISOString());
      expect(bookings[1].id).toBe('bookingOld');
      expect(bookings[1].bookedAt).toBe(bookingOldDate.toISOString());

      // Check calls: first for compound, second for simple
      expect(firebaseMocks.query).toHaveBeenCalledTimes(2);
      // First attempt (compound)
      expect(firebaseMocks.query).toHaveBeenNthCalledWith(1,
        expect.anything(),
        expect.objectContaining({ type: 'where', fieldPath: 'userId', opStr: '==', value: userId }),
        expect.objectContaining({ type: 'orderBy', fieldPath: 'bookedAt', directionStr: 'desc' })
      );
      // Second attempt (simple)
      expect(firebaseMocks.query).toHaveBeenNthCalledWith(2,
        expect.anything(),
        expect.objectContaining({ type: 'where', fieldPath: 'userId', opStr: '==', value: userId })
        // No orderBy in the simple query call
      );
      expect(firebaseMocks.getDocs).toHaveBeenCalledTimes(2);
    });

    it('3. User has no bookings', async () => {
      firebaseMocks.getDocs.mockResolvedValueOnce({ docs: [] }); // For the first (compound) query attempt

      const result = await store.dispatch(bookingApi.endpoints.getUserBookings.initiate('userWithNoBookings'));

      expect(result.status).toBe('fulfilled');
      expect(result.data).toEqual([]);
      expect(firebaseMocks.where).toHaveBeenCalledWith('userId', '==', 'userWithNoBookings');
      expect(firebaseMocks.getDocs).toHaveBeenCalledTimes(1); // Only one attempt needed
    });

    it('4. No userId provided, returns empty array and does not query', async () => {
      const result = await store.dispatch(bookingApi.endpoints.getUserBookings.initiate("")); // or undefined if type allows

      expect(result.status).toBe('fulfilled');
      expect(result.data).toEqual([]);
      expect(firebaseMocks.getDocs).not.toHaveBeenCalled();
    });
  });

  // --- getEventBookings Query Tests ---
  describe('getEventBookings Query', () => {
    const eventId = 'eventTest456';

    it('1. Successful retrieval of bookings for an event', async () => {
      const booking1Date = new Date('2024-04-01T10:00:00Z');
      const booking2Date = new Date('2024-04-05T10:00:00Z');
      const mockEventBookings = [
        createMockBookingDoc('eventBooking1', { eventId, bookedAt: mockTimestamp(booking1Date) }),
        createMockBookingDoc('eventBooking2', { eventId, bookedAt: mockTimestamp(booking2Date) }),
      ];
      firebaseMocks.getDocs.mockResolvedValueOnce({ docs: mockEventBookings });

      const result = await store.dispatch(bookingApi.endpoints.getEventBookings.initiate(eventId));

      expect(result.status).toBe('fulfilled');
      const bookings = result.data as Booking[];
      expect(bookings).toHaveLength(2);
      // Assertions on the content of bookings array:
      expect(bookings[0].eventId).toBe(eventId);
      expect(bookings[0].bookedAt).toBe(booking1Date.toISOString());
      expect(bookings[1].eventId).toBe(eventId);
      expect(bookings[1].bookedAt).toBe(booking2Date.toISOString());

      expect(firebaseMocks.where).toHaveBeenCalledWith('eventId', '==', eventId);
      expect(firebaseMocks.orderBy).toHaveBeenCalledWith('bookedAt', 'desc');
      expect(firebaseMocks.query).toHaveBeenCalledWith(
        expect.anything(), // collection ref
        expect.objectContaining({ type: 'where', fieldPath: 'eventId', opStr: '==', value: eventId }),
        expect.objectContaining({ type: 'orderBy', fieldPath: 'bookedAt', directionStr: 'desc' })
      );
      expect(firebaseMocks.getDocs).toHaveBeenCalledTimes(1);
    });
     it('2. Event has no bookings', async () => {
      firebaseMocks.getDocs.mockResolvedValueOnce({ docs: [] });

      const result = await store.dispatch(bookingApi.endpoints.getEventBookings.initiate('eventWithNoBookings'));

      expect(result.status).toBe('fulfilled');
      expect(result.data).toEqual([]);
      expect(firebaseMocks.where).toHaveBeenCalledWith('eventId', '==', 'eventWithNoBookings');
      expect(firebaseMocks.getDocs).toHaveBeenCalledTimes(1);
    });

    it('3. No eventId provided, returns empty array and does not query', async () => {
      const result = await store.dispatch(bookingApi.endpoints.getEventBookings.initiate(""));

      expect(result.status).toBe('fulfilled');
      expect(result.data).toEqual([]);
      expect(firebaseMocks.getDocs).not.toHaveBeenCalled();
    });
  });

  // --- createBooking Mutation Tests ---
  describe('createBooking Mutation', () => {
    // CreateBookingDto expects eventDate as ISO string
    const mockBookingPayload: Parameters<typeof bookingApi.endpoints.createBooking.initiate>[0] = {
      userId: 'user1',
      eventId: 'event1',
      eventName: 'Test Event',
      eventDate: new Date('2024-10-10T10:00:00Z').toISOString(),
      ticketsBooked: 2,
      totalPrice: 100,
      paymentDetails: { paymentId: 'pay123', status: 'succeeded' },
    };

    it('1. Successful booking creation', async () => {
      const newBookingId = 'newBookingXYZ';
      firebaseMocks.addDoc.mockResolvedValueOnce({ id: newBookingId });
      const fixedBookedAtDate = new Date(); // To make bookedAt predictable
      vi.useFakeTimers().setSystemTime(fixedBookedAtDate);

      const result = await store.dispatch(bookingApi.endpoints.createBooking.initiate(mockBookingPayload));
      vi.useRealTimers();

      expect(result.status).toBe('fulfilled');
      const createdBooking = result.data as Booking;

      // Assertions for the returned data (should have ISO strings for dates)
      expect(createdBooking.id).toBe(newBookingId);
      expect(createdBooking.userId).toBe(mockBookingPayload.userId);
      expect(createdBooking.status).toBe(BookingStatus.CONFIRMED); // status from API
      expect(createdBooking.checkedIn).toBe(false);
      expect(createdBooking.bookedAt).toBe(fixedBookedAtDate.toISOString());
      expect(createdBooking.eventDate).toBe(mockBookingPayload.eventDate); // Original ISO string
      expect(createdBooking.checkedInAt).toBeNull();


      expect(firebaseMocks.collection).toHaveBeenCalledWith(undefined, 'bookings');
      // Assertions for data passed to addDoc (should have Timestamps for dates)
      expect(firebaseMocks.addDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'bookings' }),
        expect.objectContaining({
          userId: mockBookingPayload.userId,
          eventId: mockBookingPayload.eventId,
          eventName: mockBookingPayload.eventName,
          eventDate: firebaseMocks.mockFirebaseTimestamp.fromDate(new Date(mockBookingPayload.eventDate)),
          ticketsBooked: mockBookingPayload.ticketsBooked,
          totalPrice: mockBookingPayload.totalPrice,
          paymentDetails: mockBookingPayload.paymentDetails,
          status: BookingStatus.CONFIRMED,
          bookedAt: firebaseMocks.mockFirebaseTimestamp.fromDate(fixedBookedAtDate),
          checkedIn: false,
          checkedInAt: null,
        })
      );
    });

    it('2. Error during booking creation', async () => {
      const creationError = { code: 'resource-exhausted', message: 'Quota exceeded' };
      firebaseMocks.addDoc.mockRejectedValueOnce(creationError);
      (handleError as vi.Mock).mockReturnValueOnce({ error: { message: "Quota exceeded" } });


      const result = await store.dispatch(bookingApi.endpoints.createBooking.initiate(mockBookingPayload));

      expect(result.status).toBe('rejected');
      // @ts-ignore
      expect(result.error.message).toBe("Quota exceeded");
      expect(handleError).toHaveBeenCalledWith(creationError);
    });
  });

  // --- updateBookingStatus Mutation Tests ---
  describe('updateBookingStatus Mutation', () => {
    const bookingId = 'bookingToUpdateStatus';
    const newStatus = BookingStatus.CANCELLED;

    it('1. Successful status update', async () => {
      firebaseMocks.updateDoc.mockResolvedValueOnce(undefined);

      const result = await store.dispatch(bookingApi.endpoints.updateBookingStatus.initiate({ id: bookingId, status: newStatus }));

      expect(result.status).toBe('fulfilled');
      expect(result.data).toBeUndefined();
      const expectedDocRef = firebaseMocks.doc(undefined, 'bookings', bookingId);
      expect(firebaseMocks.doc).toHaveBeenCalledWith(undefined, 'bookings', bookingId);
      expect(firebaseMocks.updateDoc).toHaveBeenCalledWith(expectedDocRef, { status: newStatus });
    });

    it('2. Error during status update', async () => {
      const updateError = { code: 'not-found' };
      firebaseMocks.updateDoc.mockRejectedValueOnce(updateError);
      (handleError as vi.Mock).mockReturnValueOnce({ error: { message: "Booking not found for status update" } });


      const result = await store.dispatch(bookingApi.endpoints.updateBookingStatus.initiate({ id: bookingId, status: newStatus }));
      expect(result.status).toBe('rejected');
      // @ts-ignore
      expect(result.error.message).toBe("Booking not found for status update");
    });
  });

  // --- checkInBooking Mutation Tests ---
  describe('checkInBooking Mutation', () => {
    const bookingId = 'bookingToCheckIn';
    const fixedCheckInDate = new Date();

    it('1. Successful check-in', async () => {
      firebaseMocks.updateDoc.mockResolvedValueOnce(undefined);
      vi.useFakeTimers().setSystemTime(fixedCheckInDate);

      const result = await store.dispatch(bookingApi.endpoints.checkInBooking.initiate(bookingId));
      vi.useRealTimers();

      expect(result.status).toBe('fulfilled');
      expect(result.data).toBeUndefined();
      const expectedDocRef = firebaseMocks.doc(undefined, 'bookings', bookingId);
      expect(firebaseMocks.doc).toHaveBeenCalledWith(undefined, 'bookings', bookingId);
      expect(firebaseMocks.updateDoc).toHaveBeenCalledWith(expectedDocRef, {
        checkedIn: true,
        checkedInAt: firebaseMocks.mockFirebaseTimestamp.fromDate(fixedCheckInDate), // Ensure Timestamp is used
      });
    });

    it('2. Error during check-in', async () => {
      const checkInError = { code: 'aborted' };
      firebaseMocks.updateDoc.mockRejectedValueOnce(checkInError);
      (handleError as vi.Mock).mockReturnValueOnce({ error: { message: "Check-in failed" } });

      const result = await store.dispatch(bookingApi.endpoints.checkInBooking.initiate(bookingId));
      expect(result.status).toBe('rejected');
      // @ts-ignore
      expect(result.error.message).toBe("Check-in failed");
    });
  });

  // --- cancelBooking Mutation Tests ---
  describe('cancelBooking Mutation', () => {
    const bookingId = 'bookingToCancel';

    it('1. Successful cancellation', async () => {
      firebaseMocks.updateDoc.mockResolvedValueOnce(undefined);

      const result = await store.dispatch(bookingApi.endpoints.cancelBooking.initiate(bookingId));
      expect(result.status).toBe('fulfilled');
      expect(result.data).toBeUndefined();
      const expectedDocRef = firebaseMocks.doc(undefined, 'bookings', bookingId);
      expect(firebaseMocks.doc).toHaveBeenCalledWith(undefined, 'bookings', bookingId);
      expect(firebaseMocks.updateDoc).toHaveBeenCalledWith(expectedDocRef, { status: BookingStatus.CANCELLED });
    });

    it('2. Error during cancellation', async () => {
      const cancelError = { code: 'failed-precondition', message: 'Cannot cancel now' };
      firebaseMocks.updateDoc.mockRejectedValueOnce(cancelError);
      (handleError as vi.Mock).mockReturnValueOnce({ error: { message: "Cannot cancel now" } });


      const result = await store.dispatch(bookingApi.endpoints.cancelBooking.initiate(bookingId));
      expect(result.status).toBe('rejected');
      // @ts-ignore
      expect(result.error.message).toBe("Cannot cancel now");
    });
  });

  // --- deleteBooking Mutation Tests ---
  describe('deleteBooking Mutation', () => {
    const bookingId = 'bookingToDelete';

    it('1. Successful deletion', async () => {
      firebaseMocks.deleteDoc.mockResolvedValueOnce(undefined);
      const result = await store.dispatch(bookingApi.endpoints.deleteBooking.initiate(bookingId));
      expect(result.status).toBe('fulfilled');
      expect(result.data).toBeUndefined();
      const expectedDocRef = firebaseMocks.doc(undefined, 'bookings', bookingId);
      expect(firebaseMocks.doc).toHaveBeenCalledWith(undefined, 'bookings', bookingId);
      expect(firebaseMocks.deleteDoc).toHaveBeenCalledWith(expectedDocRef);
    });

    it('2. Error during deletion', async () => {
      const deleteError = { code: 'permission-denied' };
      firebaseMocks.deleteDoc.mockRejectedValueOnce(deleteError);
      (handleError as vi.Mock).mockReturnValueOnce({ error: { message: "Permission denied" } });

      const result = await store.dispatch(bookingApi.endpoints.deleteBooking.initiate(bookingId));
      expect(result.status).toBe('rejected');
      // @ts-ignore
      expect(result.error.message).toBe("Permission denied");
    });
  });
});

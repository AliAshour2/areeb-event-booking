import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventApi } from '@/features/events/eventApi'; // Assuming this is the correct path
import { configureStore } from '@reduxjs/toolkit';
import { parseFirebaseError } from '@/helpers/parseFirebaseError'; // Though handleError is used, parseFirebaseError might be relevant for consistency
import { handleError } from '@/helpers/handleError';


// Mock @/lib/firebase
// We'll need to define mocks for Firestore services used by eventApi,
// these will be imported from firebaseMocks.ts later.
import * as firebaseMocks from './mocks/firebaseMocks';

vi.mock('@/lib/firebase', async () => {
  const actualFirebase = await vi.importActual('@/lib/firebase');
  return {
    ...actualFirebase,
    db: { // Mock the db object
      // Firestore functions will be attached here from firebaseMocks
      collection: firebaseMocks.collection,
      query: firebaseMocks.query,
      where: firebaseMocks.where,
      orderBy: firebaseMocks.orderBy,
      getDocs: firebaseMocks.getDocs,
      getDoc: firebaseMocks.getDoc,
      addDoc: firebaseMocks.addDoc,
      updateDoc: firebaseMocks.updateDoc,
      deleteDoc: firebaseMocks.deleteDoc,
      // Timestamp might be accessed via firebase.firestore.Timestamp
      // For now, we'll assume direct import or provide a mock if needed.
    },
    // auth: { ... } // If eventApi interacts with auth, mock it too
  };
});

// Mock @/helpers/handleError
vi.mock('@/helpers/handleError');

// Mock @/helpers/parseFirebaseError (if it's used by handleError or directly)
vi.mock('@/helpers/parseFirebaseError');


// Helper to create a new store for each test
const setupApiStore = () => {
  return configureStore({
    reducer: {
      [eventApi.reducerPath]: eventApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(eventApi.middleware),
  });
};

let store = setupApiStore();

// Mock Firestore Timestamp
export const mockTimestamp = (date: Date) => ({
  toDate: vi.fn(() => date),
  // Add other Timestamp properties if needed by the code (e.g., seconds, nanoseconds)
  seconds: Math.floor(date.getTime() / 1000),
  nanoseconds: (date.getTime() % 1000) * 1e6,
  isEqual: (other: any) => date.getTime() === other.toDate().getTime(),
  valueOf: () => date.valueOf().toString(), // Or whatever makes sense for your usage
  toString: () => date.toString(),
  toJSON: () => date.toJSON(),
  toMillis: () => date.getTime(),
  // Add any other methods your code might call on a Timestamp object
});


describe('Event API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = setupApiStore();

    // Default mock implementation for handleError
    (handleError as vi.Mock).mockImplementation((error) => {
      // Simplified: re-throw or return a generic error structure
      // console.error("Mocked handleError caught:", error);
      return { error: { message: error.message || 'An unexpected error occurred via handleError' } };
    });

    // Default mock implementation for parseFirebaseError (if needed by handleError)
    (parseFirebaseError as vi.Mock).mockImplementation((err: any) => {
      if (err && err.code) {
        // Add event-specific error codes if any, otherwise use generic ones
        return `Firebase error: ${err.code}`;
      }
      return 'An error occurred. Please try again.';
    });

    // Reset specific Firestore mocks from firebaseMocks (they are already vi.fn())
    // This ensures they are clean for each test.
    // Their default behavior (e.g., getDocs returning empty array) will be set in firebaseMocks.ts
    // or overridden in specific tests.
    firebaseMocks.collection.mockClear();
    firebaseMocks.query.mockClear();
    firebaseMocks.where.mockClear();
    firebaseMocks.orderBy.mockClear();
    firebaseMocks.getDocs.mockClear();
    firebaseMocks.getDoc.mockClear();
    firebaseMocks.addDoc.mockClear();
    firebaseMocks.updateDoc.mockClear();
    firebaseMocks.deleteDoc.mockClear();
    // firebaseMocks.Timestamp.fromDate.mockClear(); // If Timestamp is globally mocked
  });

  afterEach(() => {
    store.dispatch(eventApi.util.resetApiState());
  });

  describe('Get Events Query (getEvents)', () => {
    it('1. Successful retrieval with no filters, default ordering by date ascending', async () => {
      const mockEventsData = [
        { id: 'event1', title: 'Event Alpha', date: mockTimestamp(new Date('2024-01-15T10:00:00Z')), description: 'First event', category: 'Tech', price: 0 },
        { id: 'event2', title: 'Event Beta', date: mockTimestamp(new Date('2024-01-10T14:00:00Z')), description: 'Second event', category: 'Music', venue: 'The Hall', capacity: 100, imageUrl: 'http://example.com/beta.jpg', tags: ['live', 'band'] },
        { id: 'event3', title: 'Event Gamma', date: mockTimestamp(new Date('2024-01-20T12:00:00Z')), description: 'Third event', category: 'Art' }, // Missing some fields for default value check
      ];

      // Mock getDocs to return these events
      // The actual query snapshot structure is { docs: [{ id: '...', data: () => ({...}) }, ...] }
      firebaseMocks.getDocs.mockResolvedValueOnce({
        docs: mockEventsData.map(event => ({
          id: event.id,
          data: vi.fn(() => ({ // Each doc.data() needs to be a mock if further specific behavior is needed, but here just returning the object is fine.
            title: event.title,
            date: event.date, // Keep as mockTimestamp for now, eventApi should convert it
            description: event.description,
            category: event.category,
            // Include other fields if they exist in mockEventsData, otherwise they'll be undefined
            // and should be handled by default values in eventApi.ts if applicable
            venue: event.venue,
            price: event.price,
            capacity: event.capacity,
            imageUrl: event.imageUrl,
            organizerId: event.organizerId,
            location: event.location,
            tags: event.tags,
          })),
        })),
      });

      // The eventApi.ts will sort these by date ascending after fetching if no other sort is specified by query.
      // However, the Firestore query itself should be ordered by date.
      // So, the expected order in the result should be event2, event1, event3.
      const expectedSortedEvents = [
        mockEventsData[1], // event2 (Jan 10)
        mockEventsData[0], // event1 (Jan 15)
        mockEventsData[2], // event3 (Jan 20)
      ];


      const result = await store.dispatch(eventApi.endpoints.getEvents.initiate({}));

      expect(result.status).toBe('fulfilled');
      const events = result.data;
      expect(events).toBeInstanceOf(Array);
      expect(events).toHaveLength(mockEventsData.length);

      // Check Firestore query calls
      expect(firebaseMocks.collection).toHaveBeenCalledWith(undefined, 'events'); // db is undefined due to how vi.mock works here, but it should be the db instance
      expect(firebaseMocks.orderBy).toHaveBeenCalledWith('date', 'asc');
      // query mock will have the collection ref and orderBy constraint
      expect(firebaseMocks.query).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'events' }), // collection mock returns {path}
        expect.objectContaining({ type: 'orderBy', fieldPath: 'date', directionStr: 'asc' })
      );
      expect(firebaseMocks.getDocs).toHaveBeenCalledTimes(1);


      // Check data transformation and default values
      expectedSortedEvents.forEach((mockEvent, index) => {
        const eventInResult = events?.[index];
        expect(eventInResult).toBeDefined();
        expect(eventInResult?.id).toBe(mockEvent.id);
        expect(eventInResult?.title).toBe(mockEvent.title);
        expect(eventInResult?.description).toBe(mockEvent.description);
        expect(eventInResult?.date).toBe(mockEvent.date.toDate().toISOString()); // Date converted to ISO string
        expect(eventInResult?.category).toBe(mockEvent.category);

        // Check default values (as per Event type and transformResponse in eventApi.ts)
        expect(eventInResult?.imageUrl).toBe(mockEvent.imageUrl || '');
        expect(eventInResult?.price).toBe(mockEvent.price || 0);
        expect(eventInResult?.capacity).toBe(mockEvent.capacity || 0);
        expect(eventInResult?.organizerId).toBe(mockEvent.organizerId || '');
        expect(eventInResult?.venue).toBe(mockEvent.venue || '');
        expect(eventInResult?.location).toEqual(mockEvent.location || { address: '', city: '', country: '' });
        expect(eventInResult?.tags).toEqual(mockEvent.tags || []);
      });
    });

    it('2. should apply category filter server-side when it is the only filter', async () => {
      const categoryToFilter = "Music";
      const mockEventsData = [
        // Event matching the category
        { id: 'event1', title: 'Music Fest', date: mockTimestamp(new Date('2024-02-01T10:00:00Z')), description: 'Live music event', category: categoryToFilter, price: 50 },
        // Event not matching (will be filtered out by Firestore query if where clause is correctly applied)
        // { id: 'event2', title: 'Tech Conference', date: mockTimestamp(new Date('2024-02-05T09:00:00Z')), description: 'Tech talks', category: 'Tech', price: 100 },
      ];

      // If category is the only filter, eventApi.ts should add a `where("category", "==", categoryToFilter)`
      // So, getDocs should ideally only receive/return documents matching this.
      // For this test, we'll mock getDocs to return only the event that *should* be returned if the where clause worked.
      firebaseMocks.getDocs.mockResolvedValueOnce({
        docs: mockEventsData.map(event => ({ // Assuming mockEventsData here only contains "Music" events for simplicity of mock setup
          id: event.id,
          data: vi.fn(() => ({ ...event, date: event.date })), // Keep date as mockTimestamp
        })),
      });

      const result = await store.dispatch(eventApi.endpoints.getEvents.initiate({ category: categoryToFilter }));

      expect(result.status).toBe('fulfilled');
      const events = result.data;
      expect(events).toHaveLength(1);
      expect(events?.[0].category).toBe(categoryToFilter);

      expect(firebaseMocks.collection).toHaveBeenCalledWith(undefined, 'events');
      // Crucial: verify `where` was called for category
      expect(firebaseMocks.where).toHaveBeenCalledWith('category', '==', categoryToFilter);
      expect(firebaseMocks.orderBy).toHaveBeenCalledWith('date', 'asc'); // Default ordering
      // query should be called with collection, where constraint, and orderBy constraint
      expect(firebaseMocks.query).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'events' }), // collection
        expect.objectContaining({ type: 'where', fieldPath: 'category', opStr: '==', value: categoryToFilter }), // where
        expect.objectContaining({ type: 'orderBy', fieldPath: 'date', directionStr: 'asc' }) // orderBy
      );
      expect(firebaseMocks.getDocs).toHaveBeenCalledTimes(1);

      // Check transformation for the returned event
      expect(events?.[0].date).toBe(mockEventsData[0].date.toDate().toISOString());
    });

    it('3. should apply category filter client-side when combined with other filters (e.g., dateFrom)', async () => {
      const categoryToFilter = "Music";
      const dateFromFilter = "2024-01-15"; // ISO string date
      const dateFromTimestamp = firebaseMocks.mockFirebaseTimestamp.fromDate(new Date(dateFromFilter + "T00:00:00.000Z"));


      const mockServerReturnedEvents = [
        // Matches dateFrom & category (should be in final result)
        { id: 'event1', title: 'Music Event on Date', date: mockTimestamp(new Date('2024-01-16T10:00:00Z')), category: categoryToFilter, description: 'Music event' },
        // Matches dateFrom but NOT category (should be filtered out client-side)
        { id: 'event2', title: 'Tech Event on Date', date: mockTimestamp(new Date('2024-01-17T10:00:00Z')), category: 'Tech', description: 'Tech event' },
        // Does NOT match dateFrom but matches category (should be filtered out server-side)
        // This one won't be returned by getDocs if server-side date filter is working
        // { id: 'event3', title: 'Old Music Event', date: mockTimestamp(new Date('2024-01-10T10:00:00Z')), category: categoryToFilter, description: 'Old music event' },
         // Matches dateFrom & category (should be in final result)
        { id: 'event4', title: 'Another Music Event', date: mockTimestamp(new Date('2024-01-18T12:00:00Z')), category: categoryToFilter, description: 'Another music event' },
      ];

      // getDocs will be called with a query that includes the dateFrom filter (server-side)
      // but NOT the category filter. So, it should return event1, event2, event4.
      firebaseMocks.getDocs.mockResolvedValueOnce({
        docs: mockServerReturnedEvents.map(event => ({
          id: event.id,
          data: vi.fn(() => ({ ...event, date: event.date })),
        })),
      });

      const result = await store.dispatch(eventApi.endpoints.getEvents.initiate({ category: categoryToFilter, dateFrom: dateFromFilter }));

      expect(result.status).toBe('fulfilled');
      const events = result.data;

      // Expect only events matching BOTH category (client-side) and dateFrom (server-side)
      expect(events).toHaveLength(2);
      expect(events?.every(event => event.category === categoryToFilter)).toBe(true);
      expect(events?.[0].id).toBe('event1');
      expect(events?.[1].id).toBe('event4');

      // Check Firestore query calls
      expect(firebaseMocks.collection).toHaveBeenCalledWith(undefined, 'events');
      // `where` for dateFrom IS called
      expect(firebaseMocks.where).toHaveBeenCalledWith('date', '>=', dateFromTimestamp);
      // `where` for category is NOT called
      expect(firebaseMocks.where).not.toHaveBeenCalledWith('category', '==', categoryToFilter);
      expect(firebaseMocks.orderBy).toHaveBeenCalledWith('date', 'asc');
      // query should be called with collection, date where constraint, and orderBy constraint
      expect(firebaseMocks.query).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'events' }), // collection
        expect.objectContaining({ type: 'where', fieldPath: 'date', opStr: '>=', value: dateFromTimestamp }), // date where
        expect.objectContaining({ type: 'orderBy', fieldPath: 'date', directionStr: 'asc' }) // orderBy
      );
      expect(firebaseMocks.getDocs).toHaveBeenCalledTimes(1);

      // Check transformation for the returned events
      expect(events?.[0].date).toBe(mockServerReturnedEvents[0].date.toDate().toISOString());
      expect(events?.[1].date).toBe(mockServerReturnedEvents[2].date.toDate().toISOString()); // event4 is the 3rd in mockServerReturnedEvents
    });

    // --- Tag Filter Tests ---
    it("4. should apply single tag filter server-side using 'array-contains'", async () => {
      const tagToFilter = "Tech";
      const mockEventsData = [
        { id: 'event1', title: 'Tech Meetup', date: mockTimestamp(new Date('2024-03-01T10:00:00Z')), tags: [tagToFilter, "Networking"] },
        // This event would be filtered by Firestore if `where("tags", "array-contains", tagToFilter)` is applied
      ];
      firebaseMocks.getDocs.mockResolvedValueOnce({
        docs: mockEventsData.map(event => ({ id: event.id, data: vi.fn(() => ({ ...event, date: event.date })) })),
      });

      const result = await store.dispatch(eventApi.endpoints.getEvents.initiate({ tags: [tagToFilter] }));

      expect(result.status).toBe('fulfilled');
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].tags).toContain(tagToFilter);
      expect(firebaseMocks.where).toHaveBeenCalledWith('tags', 'array-contains', tagToFilter);
      expect(firebaseMocks.orderBy).toHaveBeenCalledWith('date', 'asc');
      expect(firebaseMocks.query).toHaveBeenCalledWith(
        expect.anything(), // collection ref
        expect.objectContaining({ type: 'where', fieldPath: 'tags', opStr: 'array-contains', value: tagToFilter }),
        expect.objectContaining({ type: 'orderBy', fieldPath: 'date', directionStr: 'asc' })
      );
    });

    it("5. should apply multiple tags filter server-side using 'array-contains-any' for up to 10 tags", async () => {
      const tagsToFilter = ["Tech", "Startup"];
      const mockEventsData = [
        { id: 'event1', title: 'Startup Pitch Night', date: mockTimestamp(new Date('2024-03-05T18:00:00Z')), tags: ["Startup", "Networking"] },
        { id: 'event2', title: 'AI in Tech Workshop', date: mockTimestamp(new Date('2024-03-10T10:00:00Z')), tags: ["Tech", "AI", "Workshop"] },
      ];
       // Mock getDocs to return events that would match this 'array-contains-any' query
      firebaseMocks.getDocs.mockResolvedValueOnce({
        docs: mockEventsData.map(event => ({ id: event.id, data: vi.fn(() => ({ ...event, date: event.date })) })),
      });

      const result = await store.dispatch(eventApi.endpoints.getEvents.initiate({ tags: tagsToFilter }));

      expect(result.status).toBe('fulfilled');
      expect(result.data).toHaveLength(2);
      expect(result.data?.some(event => event.tags?.includes("Startup"))).toBe(true);
      expect(result.data?.some(event => event.tags?.includes("Tech"))).toBe(true);
      expect(firebaseMocks.where).toHaveBeenCalledWith('tags', 'array-contains-any', tagsToFilter);
      expect(firebaseMocks.orderBy).toHaveBeenCalledWith('date', 'asc');
      expect(firebaseMocks.query).toHaveBeenCalledWith(
        expect.anything(), // collection ref
        expect.objectContaining({ type: 'where', fieldPath: 'tags', opStr: 'array-contains-any', value: tagsToFilter }),
        expect.objectContaining({ type: 'orderBy', fieldPath: 'date', directionStr: 'asc' })
      );
    });

    it("6. should apply first 10 tags server-side and remaining tags client-side when more than 10 tags are provided", async () => {
      const allTags = Array.from({ length: 12 }, (_, i) => `tag${i + 1}`); // tag1 to tag12
      const first10Tags = allTags.slice(0, 10);
      const clientSideTags = allTags.slice(10); // tag11, tag12

      // Events returned by server (matched one of first 10 tags)
      const serverReturnedEvents = [
        // Matches server (tag1) AND client (tag11, tag12) -> should be in final result
        { id: 'eventA', title: 'Event A', date: mockTimestamp(new Date('2024-04-01T10:00:00Z')), tags: ['tag1', 'tag11', 'tag12', 'other'] },
        // Matches server (tag2) but NOT ALL client (only tag11) -> should be filtered out client-side
        { id: 'eventB', title: 'Event B', date: mockTimestamp(new Date('2024-04-02T10:00:00Z')), tags: ['tag2', 'tag11', 'other'] },
        // Matches server (tag3) AND client (tag11, tag12) -> should be in final result
        { id: 'eventC', title: 'Event C', date: mockTimestamp(new Date('2024-04-03T10:00:00Z')), tags: ['tag3', 'tag11', 'tag12', 'another'] },
        // Matches server (tag4) but NO client tags -> should be filtered out client-side
        { id: 'eventD', title: 'Event D', date: mockTimestamp(new Date('2024-04-04T10:00:00Z')), tags: ['tag4', 'other'] },
      ];

      firebaseMocks.getDocs.mockResolvedValueOnce({
        docs: serverReturnedEvents.map(event => ({ id: event.id, data: vi.fn(() => ({ ...event, date: event.date })) })),
      });

      const result = await store.dispatch(eventApi.endpoints.getEvents.initiate({ tags: allTags }));

      expect(result.status).toBe('fulfilled');
      const events = result.data;
      expect(events).toHaveLength(2); // Only eventA and eventC should remain
      expect(events?.find(e => e.id === 'eventA')).toBeDefined();
      expect(events?.find(e => e.id === 'eventC')).toBeDefined();

      expect(firebaseMocks.where).toHaveBeenCalledWith('tags', 'array-contains-any', first10Tags);
      expect(firebaseMocks.orderBy).toHaveBeenCalledWith('date', 'asc');
    });

    it("7. should correctly combine tag filters ('array-contains-any') with other server-side filters like dateFrom", async () => {
      const tagsToFilter = ["Workshop", "Online"];
      const dateFromFilter = "2024-03-01";
      const dateFromTimestamp = firebaseMocks.mockFirebaseTimestamp.fromDate(new Date(dateFromFilter + "T00:00:00.000Z"));

      const mockEventsData = [
        { id: 'event1', title: 'Online Workshop March', date: mockTimestamp(new Date('2024-03-05T10:00:00Z')), tags: ["Workshop", "Online", "JS"], category: "Tech" },
        // This event would be filtered by Firestore if all where clauses are applied
      ];
      firebaseMocks.getDocs.mockResolvedValueOnce({
        docs: mockEventsData.map(event => ({ id: event.id, data: vi.fn(() => ({ ...event, date: event.date })) })),
      });

      const result = await store.dispatch(eventApi.endpoints.getEvents.initiate({ tags: tagsToFilter, dateFrom: dateFromFilter }));

      expect(result.status).toBe('fulfilled');
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].id).toBe('event1');

      // Check that `where` was called for both tags and dateFrom
      expect(firebaseMocks.where).toHaveBeenCalledWith('tags', 'array-contains-any', tagsToFilter);
      expect(firebaseMocks.where).toHaveBeenCalledWith('date', '>=', dateFromTimestamp);
      expect(firebaseMocks.orderBy).toHaveBeenCalledWith('date', 'asc');
      // Check that query was called with all constraints
      expect(firebaseMocks.query).toHaveBeenCalledWith(
        expect.anything(), // collection ref
        expect.objectContaining({ type: 'where', fieldPath: 'tags', opStr: 'array-contains-any', value: tagsToFilter }),
        expect.objectContaining({ type: 'where', fieldPath: 'date', opStr: '>=', value: dateFromTimestamp }),
        expect.objectContaining({ type: 'orderBy', fieldPath: 'date', directionStr: 'asc' })
      );
    });

    // --- Date Range Filter Tests ---
    it("8. should apply dateFrom filter server-side", async () => {
      const dateFromFilter = "2023-05-10";
      const expectedDateFromTimestamp = firebaseMocks.mockFirebaseTimestamp.fromDate(new Date("2023-05-10T00:00:00.000Z"));
      firebaseMocks.getDocs.mockResolvedValueOnce({ docs: [] }); // Data content not critical for this query check

      await store.dispatch(eventApi.endpoints.getEvents.initiate({ dateFrom: dateFromFilter }));

      expect(firebaseMocks.where).toHaveBeenCalledWith('date', '>=', expectedDateFromTimestamp);
      expect(firebaseMocks.orderBy).toHaveBeenCalledWith('date', 'asc');
      expect(firebaseMocks.query).toHaveBeenCalledWith(
        expect.anything(), // collection
        expect.objectContaining({ type: 'where', fieldPath: 'date', opStr: '>=', value: expectedDateFromTimestamp }),
        expect.objectContaining({ type: 'orderBy', fieldPath: 'date', directionStr: 'asc' })
      );
    });

    it("9. should apply dateTo filter server-side", async () => {
      const dateToFilter = "2023-06-20";
      const expectedDateToTimestamp = firebaseMocks.mockFirebaseTimestamp.fromDate(new Date("2023-06-20T23:59:59.999Z"));
      firebaseMocks.getDocs.mockResolvedValueOnce({ docs: [] });

      await store.dispatch(eventApi.endpoints.getEvents.initiate({ dateTo: dateToFilter }));

      expect(firebaseMocks.where).toHaveBeenCalledWith('date', '<=', expectedDateToTimestamp);
      expect(firebaseMocks.orderBy).toHaveBeenCalledWith('date', 'asc');
      expect(firebaseMocks.query).toHaveBeenCalledWith(
        expect.anything(), // collection
        expect.objectContaining({ type: 'where', fieldPath: 'date', opStr: '<=', value: expectedDateToTimestamp }),
        expect.objectContaining({ type: 'orderBy', fieldPath: 'date', directionStr: 'asc' })
      );
    });

    it("10. should apply both dateFrom and dateTo filters server-side", async () => {
      const dateFromFilter = "2023-05-10";
      const dateToFilter = "2023-06-20";
      const expectedDateFromTimestamp = firebaseMocks.mockFirebaseTimestamp.fromDate(new Date("2023-05-10T00:00:00.000Z"));
      const expectedDateToTimestamp = firebaseMocks.mockFirebaseTimestamp.fromDate(new Date("2023-06-20T23:59:59.999Z"));
      firebaseMocks.getDocs.mockResolvedValueOnce({ docs: [] });

      await store.dispatch(eventApi.endpoints.getEvents.initiate({ dateFrom: dateFromFilter, dateTo: dateToFilter }));

      expect(firebaseMocks.where).toHaveBeenCalledWith('date', '>=', expectedDateFromTimestamp);
      expect(firebaseMocks.where).toHaveBeenCalledWith('date', '<=', expectedDateToTimestamp);
      expect(firebaseMocks.orderBy).toHaveBeenCalledWith('date', 'asc');
      expect(firebaseMocks.query).toHaveBeenCalledWith(
        expect.anything(), // collection
        expect.objectContaining({ type: 'where', fieldPath: 'date', opStr: '>=', value: expectedDateFromTimestamp }),
        expect.objectContaining({ type: 'where', fieldPath: 'date', opStr: '<=', value: expectedDateToTimestamp }),
        expect.objectContaining({ type: 'orderBy', fieldPath: 'date', directionStr: 'asc' })
      );
    });

    // --- Search Term Filter Tests ---
    it("11. should apply search filter client-side on title, description, venue, category, and tags", async () => {
      const searchTerm = "Workshop";
      const mockEventsFromServer = [
        // Matches title
        { id: 'eventS1', title: 'Advanced JS Workshop', date: mockTimestamp(new Date('2024-05-01T10:00:00Z')), description: 'Deep dive into JS', category: 'Tech', tags: ['JavaScript'], venue: 'Online' },
        // Matches description
        { id: 'eventS2', title: 'Art Class', date: mockTimestamp(new Date('2024-05-02T10:00:00Z')), description: 'A fun workshop for painting', category: 'Art', tags: ['Painting'], venue: 'Studio A' },
        // Matches venue
        { id: 'eventS3', title: 'Pottery Making', date: mockTimestamp(new Date('2024-05-03T10:00:00Z')), description: 'Hands-on pottery', category: 'Crafts', tags: ['Pottery'], venue: 'Community Workshop' },
        // Matches category
        { id: 'eventS4', title: 'Music Theory', date: mockTimestamp(new Date('2024-05-04T10:00:00Z')), description: 'Learn music theory', category: 'Music Workshop', tags: ['Music'], venue: 'Music Hall' },
        // Matches tags
        { id: 'eventS5', title: 'Coding Bootcamp', date: mockTimestamp(new Date('2024-05-05T10:00:00Z')), description: 'Intensive coding', category: 'Tech', tags: ['Coding', 'Workshop'], venue: 'Online' },
        // No match
        { id: 'eventS6', title: 'Book Club Meetup', date: mockTimestamp(new Date('2024-05-06T10:00:00Z')), description: 'Discussing latest novel', category: 'Literature', tags: ['Reading'], venue: 'Library' },
         // Matches title (case-insensitive)
        { id: 'eventS7', title: 'Advanced JS workshop', date: mockTimestamp(new Date('2024-05-07T10:00:00Z')), description: 'Deep dive into JS', category: 'Tech', tags: ['JavaScript'], venue: 'Online' },
      ];
      firebaseMocks.getDocs.mockResolvedValueOnce({
        docs: mockEventsFromServer.map(event => ({ id: event.id, data: vi.fn(() => ({ ...event, date: event.date })) })),
      });

      const result = await store.dispatch(eventApi.endpoints.getEvents.initiate({ search: searchTerm }));

      expect(result.status).toBe('fulfilled');
      const events = result.data;
      // Expect 5 matching events: eventS1, eventS2, eventS3, eventS4, eventS5, eventS7
      expect(events).toHaveLength(6);
      expect(events?.map(e => e.id).sort()).toEqual(['eventS1', 'eventS2', 'eventS3', 'eventS4', 'eventS5', 'eventS7'].sort());

      // Ensure search is client-side: no specific `where` clause for search fields
      expect(firebaseMocks.where).not.toHaveBeenCalledWith('title', '>=', searchTerm); // Example, no such query for search
      expect(firebaseMocks.query).toHaveBeenCalledWith(
        expect.anything(), // collection
        expect.objectContaining({ type: 'orderBy', fieldPath: 'date', directionStr: 'asc' }) // Only default ordering
      );
       // Ensure final list is sorted by date (as per eventApi logic)
      const eventDates = events?.map(e => new Date(e.date).getTime());
      for (let i = 0; i < (eventDates?.length || 0) - 1; i++) {
        expect(eventDates?.[i]).toBeLessThanOrEqual(eventDates?.[i+1] || 0);
      }
    });

    it("12. should apply search filter client-side after server-side filters like dateFrom", async () => {
      const searchTerm = "Tech";
      const dateFromFilter = "2024-06-01";
      const expectedDateFromTimestamp = firebaseMocks.mockFirebaseTimestamp.fromDate(new Date("2024-06-01T00:00:00.000Z"));

      const mockEventsForServer = [
        // Matches dateFrom, and matches search term "Tech" in category
        { id: 'eventSF1', title: 'Future of Tech Summit', date: mockTimestamp(new Date('2024-06-05T10:00:00Z')), category: 'Tech', description: 'Keynotes and discussions' },
        // Matches dateFrom, but does NOT match search term "Tech"
        { id: 'eventSF2', title: 'Art Expo', date: mockTimestamp(new Date('2024-06-10T14:00:00Z')), category: 'Art', description: 'Modern art pieces' },
        // Does NOT match dateFrom (will be filtered by server)
        // { id: 'eventSF3', title: 'Old Tech Meetup', date: mockTimestamp(new Date('2024-05-20T10:00:00Z')), category: 'Tech', description: 'Retro tech' },
        // Matches dateFrom, and matches search term "Tech" in tags
        { id: 'eventSF4', title: 'AI Workshop', date: mockTimestamp(new Date('2024-06-15T09:00:00Z')), category: 'AI', description: 'Hands-on AI', tags: ['Tech', 'Machine Learning'] },
      ];

      // getDocs will be called with a query that includes the dateFrom filter.
      // So, it should effectively return eventSF1, eventSF2, eventSF4 from the above list.
      firebaseMocks.getDocs.mockResolvedValueOnce({
        docs: [mockEventsForServer[0], mockEventsForServer[1], mockEventsForServer[3]].map(event => ({ // eventSF3 is filtered by server
          id: event.id,
          data: vi.fn(() => ({ ...event, date: event.date })),
        })),
      });

      const result = await store.dispatch(eventApi.endpoints.getEvents.initiate({ dateFrom: dateFromFilter, search: searchTerm }));

      expect(result.status).toBe('fulfilled');
      const events = result.data;

      // Client-side search for "Tech" will filter out eventSF2.
      // So, only eventSF1 and eventSF4 should remain.
      expect(events).toHaveLength(2);
      expect(events?.map(e => e.id).sort()).toEqual(['eventSF1', 'eventSF4'].sort());

      // Check server-side query
      expect(firebaseMocks.where).toHaveBeenCalledWith('date', '>=', expectedDateFromTimestamp);
      expect(firebaseMocks.orderBy).toHaveBeenCalledWith('date', 'asc');
      expect(firebaseMocks.query).toHaveBeenCalledWith(
        expect.anything(), // collection
        expect.objectContaining({ type: 'where', fieldPath: 'date', opStr: '>=', value: expectedDateFromTimestamp }),
        expect.objectContaining({ type: 'orderBy', fieldPath: 'date', directionStr: 'asc' })
      );

      // Ensure final list is sorted by date
      const eventDates = events?.map(e => new Date(e.date).getTime());
      for (let i = 0; i < (eventDates?.length || 0) - 1; i++) {
        expect(eventDates?.[i]).toBeLessThanOrEqual(eventDates?.[i+1] || 0);
      }
    });
  });

  // --- Get Event By ID Query (getEvent) ---
  describe('Get Event By ID Query (getEvent)', () => {
    const eventId = 'event123';
    const mockEventDocData = {
      title: 'Specific Event',
      date: mockTimestamp(new Date('2024-07-01T10:00:00Z')),
      description: 'Details about specific event',
      category: 'Special',
      // other fields as necessary, matching the Event type
      imageUrl: 'http://example.com/specific.jpg',
      price: 25,
      capacity: 50,
      organizerId: 'org789',
      venue: 'Main Hall',
      location: { address: '123 Main St', city: 'EventCity', country: 'EventCountry' },
      tags: ['unique', 'featured'],
      attendees: [],
      comments: [],
    };

    it('1. Successful retrieval of a single event', async () => {
      firebaseMocks.getDoc.mockResolvedValueOnce({
        exists: () => true,
        id: eventId,
        data: vi.fn(() => mockEventDocData),
      });

      const result = await store.dispatch(eventApi.endpoints.getEvent.initiate(eventId));

      expect(result.status).toBe('fulfilled');
      const event = result.data;
      expect(event).toBeDefined();
      expect(event?.id).toBe(eventId);
      expect(event?.title).toBe(mockEventDocData.title);
      expect(event?.date).toBe(mockEventDocData.date.toDate().toISOString());
      // Check default values for fields not in mockEventDocData but in Event type
      expect(event?.imageUrl).toBe(mockEventDocData.imageUrl || '');

      expect(firebaseMocks.doc).toHaveBeenCalledWith(undefined, 'events', eventId);
      expect(firebaseMocks.getDoc).toHaveBeenCalledWith(expect.objectContaining({ path: `events/${eventId}` }));
    });

    it('2. Event not found', async () => {
      firebaseMocks.getDoc.mockResolvedValueOnce({
        exists: () => false,
        id: 'unknownId',
        data: vi.fn(() => undefined),
      });
      (handleError as vi.Mock).mockReturnValueOnce({ error: { message: "Event not found" } });


      const result = await store.dispatch(eventApi.endpoints.getEvent.initiate('unknownId'));
      expect(result.status).toBe('rejected');
      // @ts-ignore
      expect(result.error.message).toBe('Event not found');
      expect(firebaseMocks.doc).toHaveBeenCalledWith(undefined, 'events', 'unknownId');
    });
  });

  // --- Get Events By Organizer Query (getEventsByOrganizer) ---
  describe('Get Events By Organizer Query (getEventsByOrganizer)', () => {
    const organizerId = 'organizer123';
    const mockOrganizerEventsData = [
      { id: 'orgEvent1', title: 'Event by Org1', date: mockTimestamp(new Date('2024-08-01T10:00:00Z')), organizerId: organizerId, category: 'Workshop' },
      { id: 'orgEvent2', title: 'Another by Org1', date: mockTimestamp(new Date('2024-07-15T14:00:00Z')), organizerId: organizerId, category: 'Meetup' },
    ];

    it('1. Successful retrieval of events for an organizer', async () => {
      firebaseMocks.getDocs.mockResolvedValueOnce({
        docs: mockOrganizerEventsData.map(event => ({
          id: event.id,
          data: vi.fn(() => ({...event, date: event.date})),
        })),
      });
      // Expected sorted by date ascending
      const expectedSortedByDate = [mockOrganizerEventsData[1], mockOrganizerEventsData[0]];


      const result = await store.dispatch(eventApi.endpoints.getEventsByOrganizer.initiate(organizerId));

      expect(result.status).toBe('fulfilled');
      const events = result.data;
      expect(events).toHaveLength(2);
      expect(events?.[0].id).toBe(expectedSortedByDate[0].id);
      expect(events?.[1].id).toBe(expectedSortedByDate[1].id);
      expect(events?.every(e => e.organizerId === organizerId)).toBe(true);

      expect(firebaseMocks.where).toHaveBeenCalledWith('organizerId', '==', organizerId);
      expect(firebaseMocks.orderBy).toHaveBeenCalledWith('date', 'asc');
      expect(firebaseMocks.query).toHaveBeenCalledWith(
        expect.anything(), // collection
        expect.objectContaining({ type: 'where', fieldPath: 'organizerId', opStr: '==', value: organizerId }),
        expect.objectContaining({ type: 'orderBy', fieldPath: 'date', directionStr: 'asc' })
      );
    });

    it('2. Organizer has no events', async () => {
      firebaseMocks.getDocs.mockResolvedValueOnce({ docs: [] });

      const result = await store.dispatch(eventApi.endpoints.getEventsByOrganizer.initiate('orgWithNoEvents'));
      expect(result.status).toBe('fulfilled');
      expect(result.data).toEqual([]);
      expect(firebaseMocks.where).toHaveBeenCalledWith('organizerId', '==', 'orgWithNoEvents');
    });
  });

  // --- Create Event Mutation (createEvent) ---
  describe('Create Event Mutation (createEvent)', () => {
    const newEventData = {
      title: 'Brand New Event',
      description: 'This is a test event.',
      date: new Date('2024-09-01T12:00:00Z').toISOString(), // Input as ISO string
      category: 'Community',
      price: 10,
      capacity: 100,
      venue: 'Community Hall',
      location: { address: '456 Town Rd', city: 'Newville', country: 'Testland' },
      tags: ['new', 'test'],
      organizerId: 'orgTest123',
      imageUrl: 'http://example.com/newevent.png'
    };
    const expectedTimestamp = firebaseMocks.mockFirebaseTimestamp.fromDate(new Date(newEventData.date));

    it('1. Successful event creation', async () => {
      const newEventId = 'newEventId123';
      firebaseMocks.addDoc.mockResolvedValueOnce({ id: newEventId });

      const result = await store.dispatch(eventApi.endpoints.createEvent.initiate(newEventData));

      expect(result.status).toBe('fulfilled');
      // @ts-ignore
      expect(result.data?.id).toBe(newEventId);
      // @ts-ignore
      expect(result.data?.title).toBe(newEventData.title);

      expect(firebaseMocks.collection).toHaveBeenCalledWith(undefined, 'events');
      expect(firebaseMocks.addDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'events' }),
        expect.objectContaining({
          ...newEventData,
          date: expectedTimestamp, // Date should be converted to Firestore Timestamp
          // attendees and comments should be initialized as empty arrays by the endpoint
          attendees: [],
          comments: [],
        })
      );
    });

     it('2. Error during event creation', async () => {
      const creationError = { code: 'permission-denied', message: 'Permission denied for creation' };
      firebaseMocks.addDoc.mockRejectedValueOnce(creationError);
      (handleError as vi.Mock).mockReturnValueOnce({ error: { message: "Permission denied for creation" } });


      const result = await store.dispatch(eventApi.endpoints.createEvent.initiate(newEventData));

      expect(result.status).toBe('rejected');
       // @ts-ignore
      expect(result.error.message).toBe("Permission denied for creation");
      expect(handleError).toHaveBeenCalledWith(creationError);
    });
  });

  // --- Update Event Mutation (updateEvent) ---
  describe('Update Event Mutation (updateEvent)', () => {
    const eventIdToUpdate = 'eventToUpdate123';
    const updateData = {
      title: 'Updated Event Title',
      price: 15,
      date: new Date('2024-09-15T10:00:00Z').toISOString(), // Input as ISO string
    };
    const expectedTimestampForUpdate = firebaseMocks.mockFirebaseTimestamp.fromDate(new Date(updateData.date));


    it('1. Successful event update', async () => {
      firebaseMocks.updateDoc.mockResolvedValueOnce(undefined);

      const result = await store.dispatch(eventApi.endpoints.updateEvent.initiate({ id: eventIdToUpdate, data: updateData }));

      expect(result.status).toBe('fulfilled');
      // @ts-ignore
      expect(result.data).toBeUndefined(); // Successful update typically returns void or the updated object structure

      const expectedDocRef = firebaseMocks.doc(undefined, 'events', eventIdToUpdate);
      expect(firebaseMocks.doc).toHaveBeenCalledWith(undefined, 'events', eventIdToUpdate);
      expect(firebaseMocks.updateDoc).toHaveBeenCalledWith(
        expectedDocRef,
        { ...updateData, date: expectedTimestampForUpdate } // Date converted to Timestamp
      );
    });

    it('2. Error during event update', async () => {
      const updateError = { code: 'not-found', message: 'Event not found for update' };
      firebaseMocks.updateDoc.mockRejectedValueOnce(updateError);
      (handleError as vi.Mock).mockReturnValueOnce({ error: { message: "Event not found for update" } });

      const result = await store.dispatch(eventApi.endpoints.updateEvent.initiate({ id: eventIdToUpdate, data: updateData }));

      expect(result.status).toBe('rejected');
      // @ts-ignore
      expect(result.error.message).toBe("Event not found for update");
      expect(handleError).toHaveBeenCalledWith(updateError);
    });
  });

  // --- Delete Event Mutation (deleteEvent) ---
  describe('Delete Event Mutation (deleteEvent)', () => {
    const eventIdToDelete = 'eventToDelete123';

    it('1. Successful event deletion', async () => {
      firebaseMocks.deleteDoc.mockResolvedValueOnce(undefined);

      const result = await store.dispatch(eventApi.endpoints.deleteEvent.initiate(eventIdToDelete));

      expect(result.status).toBe('fulfilled');
      // @ts-ignore
      expect(result.data).toBeUndefined(); // Successful deletion returns void

      const expectedDocRef = firebaseMocks.doc(undefined, 'events', eventIdToDelete);
      expect(firebaseMocks.doc).toHaveBeenCalledWith(undefined, 'events', eventIdToDelete);
      expect(firebaseMocks.deleteDoc).toHaveBeenCalledWith(expectedDocRef);
    });

    it('2. Error during event deletion', async () => {
      const deleteError = { code: 'permission-denied', message: 'Permission denied for deletion' };
      firebaseMocks.deleteDoc.mockRejectedValueOnce(deleteError);
      (handleError as vi.Mock).mockReturnValueOnce({ error: { message: "Permission denied for deletion" } });


      const result = await store.dispatch(eventApi.endpoints.deleteEvent.initiate(eventIdToDelete));

      expect(result.status).toBe('rejected');
      // @ts-ignore
      expect(result.error.message).toBe("Permission denied for deletion");
      expect(handleError).toHaveBeenCalledWith(deleteError);
    });
  });
});

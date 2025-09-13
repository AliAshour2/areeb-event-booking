import { handleError } from "@/helpers/handleError";
import { db } from "@/lib/firebase";
import type { EventFilters } from "@/types";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from "@firebase/firestore";
import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";

import type { Event } from '@/types';
type CreateEventDto = Omit<Event, "id">;
type UpdateEventDto = Partial<CreateEventDto>;

export const eventApi = createApi({
  reducerPath: "eventApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: ["Event"],
  endpoints: (builder) => ({
    getEvents: builder.query<Event[], EventFilters | void>({
      async queryFn(filters: EventFilters = {}) {
        try {
          const eventsRef = collection(db, "events");
          const queryConstraints = [];
          

          const hasOtherFilters = !!(filters.dateFrom || filters.dateTo || filters.tags?.length);
          
          if (filters.category && !hasOtherFilters) {
            queryConstraints.push(where("category", "==", filters.category));
          }
          
          

          if (filters.tags && filters.tags.length > 0) {
            if (filters.tags.length === 1) {

              queryConstraints.push(where("tags", "array-contains", filters.tags[0]));
            } else if (filters.tags.length <= 10) {

              queryConstraints.push(where("tags", "array-contains-any", filters.tags));
            } else {

              queryConstraints.push(where("tags", "array-contains-any", filters.tags.slice(0, 10)));
            }
          }

          // Add date filters
          if (filters.dateFrom) {
            const fromDate = new Date(filters.dateFrom);
            fromDate.setHours(0, 0, 0, 0);
            queryConstraints.push(where("date", ">=", Timestamp.fromDate(fromDate)));
          }

          if (filters.dateTo) {
            const toDate = new Date(filters.dateTo);
            toDate.setHours(23, 59, 59, 999);
            queryConstraints.push(where("date", "<=", Timestamp.fromDate(toDate)));
          }

          // Add orderBy constraint
          queryConstraints.push(orderBy("date", "asc"));
          
          // Create the query with all constraints
          const baseQuery = queryConstraints.length > 0 
            ? query(eventsRef, ...queryConstraints) 
            : query(eventsRef, orderBy("date", "asc"));
            
          try {
            const querySnapshot = await getDocs(baseQuery);
            let events = querySnapshot.docs.map((doc) => {
              const data = doc.data();
              
              return {
                id: doc.id,
                title: data.title || '',
                description: data.description || '',
                date: data.date?.toDate()?.toISOString() || new Date().toISOString(),
                venue: data.venue || data.location || '',
                location: data.location || data.venue || '',
                category: data.category || '',
                tags: Array.isArray(data.tags) ? data.tags : [],
                imageUrl: data.imageUrl || '/placeholder.jpg',
                price: Number(data.price) || 0,
                capacity: Number(data.capacity) || 0,
                organizerId: data.organizerId || '',
              } as Event;
            });

            // Handle category filtering client-side if we couldn't use it in the query
            if (filters.category && hasOtherFilters) {
              events = events.filter(event => 
                event.category?.toLowerCase() === filters.category?.toLowerCase()
              );
            }

            // Handle additional tag filtering client-side if needed (for more than 10 tags)
            if (filters.tags && filters.tags.length > 10) {
              events = events.filter((event) => {
                // For tags beyond the 10th, check if they exist in the event tags
                return filters.tags!.slice(10).every(tag => 
                  event.tags?.some(eventTag => 
                    eventTag.toLowerCase() === tag.toLowerCase()
                  )
                );
              });
            }

            // Apply search filter client-side
            if (filters.search) {
              const term = filters.search.toLowerCase();
              events = events.filter((event) =>
                event.title.toLowerCase().includes(term) || 
                event.description.toLowerCase().includes(term) ||
                (event.venue ?? '').toLowerCase().includes(term) ||
                (event.category ?? '').toLowerCase().includes(term) ||
                (event.tags ?? []).some(tag => tag.toLowerCase().includes(term))
              );
            }

            // Ensure events are sorted by date
            events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            return { data: events };
          } catch (queryError) {
            return handleError(queryError);
          }
        } catch (error) {
          return handleError(error);
        }
      },
      providesTags: ["Event"],
    }),

    getEvent: builder.query<Event, string>({
      async queryFn(id) {
        try {
          const docRef = doc(db, "events", id);
          const docSnap = await getDoc(docRef);
          if (!docSnap.exists()) {
            throw new Error("Event not found");
          }
          const event = {
            id: docSnap.id,
            ...docSnap.data(),
            date: docSnap.data().date.toDate().toISOString(),
          } as Event;
          return { data: event };
        } catch (error) {
          return handleError(error);
        }
      },
      providesTags: ["Event"],
    }),

    getEventsByOrganizer: builder.query<Event[], string>({
      async queryFn(organizerId) {
        try {
          const eventsRef = collection(db, "events");
          const q = query(
            eventsRef,
            where("organizerId", "==", organizerId),
            orderBy("date", "asc")
          );
          const querySnapshot = await getDocs(q);
          const events = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            date: doc.data().date.toDate().toISOString(),
          })) as Event[];
          return { data: events };
        } catch (error) {
          return handleError(error);
        }
      },
      providesTags: ["Event"],
    }),

    createEvent: builder.mutation<Event, CreateEventDto>({
      async queryFn(eventData) {
        try {
          const event = {
            ...eventData,
            date: Timestamp.fromDate(new Date(eventData.date)),
          };
          const eventsRef = collection(db, "events");
          const docRef = await addDoc(eventsRef, event);
          return {
            data: {
              id: docRef.id,
              ...eventData,
            },
          };
        } catch (error) {
          return handleError(error);
        }
      },
      invalidatesTags: ["Event"],
    }),

    updateEvent: builder.mutation<void, { id: string; data: UpdateEventDto }>({
      async queryFn({ id, data }) {
        try {
          const docRef = doc(db, "events", id);
          const updateData = {
            ...data,
            ...(data.date && { date: Timestamp.fromDate(new Date(data.date)) }),
          };
          await updateDoc(docRef, updateData);
          return { data: undefined };
        } catch (error) {
          return handleError(error);
        }
      },
      invalidatesTags: ["Event"],
    }),

    deleteEvent: builder.mutation<void, string>({
      async queryFn(id) {
        try {
          const docRef = doc(db, "events", id);
          await deleteDoc(docRef);
          return { data: undefined };
        } catch (error) {
          return handleError(error);
        }
      },
      invalidatesTags: ["Event"],
    }),
  }),
});

export const {
  useGetEventsQuery,
  useGetEventQuery,
  useGetEventsByOrganizerQuery,
  useCreateEventMutation,
  useUpdateEventMutation,
  useDeleteEventMutation,
} = eventApi;

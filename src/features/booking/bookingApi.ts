import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp, // Added Timestamp
} from "firebase/firestore";
import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { handleError } from "@/helpers/handleError";

export interface Booking {
  id: string;
  eventId: string;
  userId: string;
  eventName: string; // Added
  eventDate: string; // Added - ISO String
  ticketsBooked: number; // Changed from quantity
  totalPrice: number;
  status: "pending" | "confirmed" | "cancelled";
  bookedAt: string; // ISO String
  checkedIn: boolean; // Not optional, defaults to false
  checkedInAt?: string | null; // ISO String or null
  paymentDetails: { paymentId: string; status: string }; // Added
}

// Fields provided by the client when creating a booking
type CreateBookingDto = {
  userId: string;
  eventId: string;
  eventName: string;
  eventDate: string; // Expect ISO string from client
  ticketsBooked: number;
  totalPrice: number;
  paymentDetails: { paymentId: string; status: string };
};

export const bookingApi = createApi({
  reducerPath: "bookingApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: ["Booking"],
  endpoints: (builder) => ({
    getBookings: builder.query<Booking[], void>({
      async queryFn() {
        try {
          const bookingsRef = collection(db, "bookings");
          const q = query(
            bookingsRef,
            orderBy("bookedAt", "desc")
          );
          const querySnapshot = await getDocs(q);
          const bookings = querySnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              eventId: data.eventId,
              userId: data.userId,
              eventName: data.eventName,
              eventDate: data.eventDate?.toDate ? data.eventDate.toDate().toISOString() : data.eventDate,
              ticketsBooked: data.ticketsBooked,
              totalPrice: data.totalPrice,
              status: data.status,
              bookedAt: data.bookedAt?.toDate ? data.bookedAt.toDate().toISOString() : data.bookedAt,
              checkedIn: data.checkedIn || false,
              checkedInAt: data.checkedInAt?.toDate ? data.checkedInAt.toDate().toISOString() : data.checkedInAt,
              paymentDetails: data.paymentDetails,
            } as Booking;
          });
          return { data: bookings };
        } catch (error) {
          return handleError(error);
        }
      },
      providesTags: ["Booking"],
    }),

    getUserBookings: builder.query<Booking[], string>({
      async queryFn(userId) {
        try {
          if (!userId) {
            return { data: [] };
          }
          
          const bookingsRef = collection(db, "bookings");
          
          try {
            // First try with compound query (requires index)
            const q = query(
              bookingsRef,
              where("userId", "==", userId),
              orderBy("bookedAt", "desc")
            );
            
            const querySnapshot = await getDocs(q);
            const bookings = querySnapshot.docs.map((doc) => {
              const data = doc.data();
              return {
                id: doc.id,
                eventId: data.eventId,
                userId: data.userId,
                eventName: data.eventName,
                eventDate: data.eventDate?.toDate ? data.eventDate.toDate().toISOString() : data.eventDate,
                ticketsBooked: data.ticketsBooked,
                totalPrice: data.totalPrice,
                status: data.status,
                bookedAt: data.bookedAt?.toDate ? data.bookedAt.toDate().toISOString() : data.bookedAt,
                checkedIn: data.checkedIn || false,
                checkedInAt: data.checkedInAt?.toDate ? data.checkedInAt.toDate().toISOString() : data.checkedInAt,
                paymentDetails: data.paymentDetails,
              } as Booking;
            });
            return { data: bookings };
          } catch (indexError: unknown) {
            if ((indexError as { code: string }).code === 'failed-precondition') {
              // Fall back to simple query if index is missing
              const simpleQ = query(
                bookingsRef,
                where("userId", "==", userId)
              );
              
              const querySnapshot = await getDocs(simpleQ);
              let bookings = querySnapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                  id: doc.id,
                  eventId: data.eventId,
                  userId: data.userId,
                  eventName: data.eventName,
                  eventDate: data.eventDate?.toDate ? data.eventDate.toDate().toISOString() : data.eventDate,
                  ticketsBooked: data.ticketsBooked,
                  totalPrice: data.totalPrice,
                  status: data.status,
                  bookedAt: data.bookedAt?.toDate ? data.bookedAt.toDate().toISOString() : data.bookedAt,
                  checkedIn: data.checkedIn || false,
                  checkedInAt: data.checkedInAt?.toDate ? data.checkedInAt.toDate().toISOString() : data.checkedInAt,
                  paymentDetails: data.paymentDetails,
                } as Booking;
              });
              
              // Sort manually in memory
              bookings.sort((a, b) => {
                // Ensure bookedAt is a string (ISO) before creating Date objects for sorting
                const dateA = typeof a.bookedAt === 'string' ? new Date(a.bookedAt).getTime() : 0;
                const dateB = typeof b.bookedAt === 'string' ? new Date(b.bookedAt).getTime() : 0;
                return dateB - dateA;
              });
              
              return { data: bookings };
            }
            throw indexError;
          }
        } catch (error) {
          return handleError(error);
        }
      },
      providesTags: ["Booking"],
    }),

    getEventBookings: builder.query<Booking[], string>({
      async queryFn(eventId) {
        try {
          const bookingsRef = collection(db, "bookings");
          const q = query(
            bookingsRef,
            where("eventId", "==", eventId),
            orderBy("bookedAt", "desc")
          );
          const querySnapshot = await getDocs(q);
          const bookings = querySnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              eventId: data.eventId,
              userId: data.userId,
              eventName: data.eventName,
              eventDate: data.eventDate?.toDate ? data.eventDate.toDate().toISOString() : data.eventDate,
              ticketsBooked: data.ticketsBooked,
              totalPrice: data.totalPrice,
              status: data.status,
              bookedAt: data.bookedAt?.toDate ? data.bookedAt.toDate().toISOString() : data.bookedAt,
              checkedIn: data.checkedIn || false,
              checkedInAt: data.checkedInAt?.toDate ? data.checkedInAt.toDate().toISOString() : data.checkedInAt,
              paymentDetails: data.paymentDetails,
            } as Booking;
          });
          return { data: bookings };
        } catch (error) {
          return handleError(error);
        }
      },
      providesTags: ["Booking"],
    }),

    createBooking: builder.mutation<Booking, CreateBookingDto>({
      async queryFn(bookingData) {
        try {
          // Data to be stored in Firestore, converting dates to Timestamps
          const dataToStore = {
            userId: bookingData.userId,
            eventId: bookingData.eventId,
            eventName: bookingData.eventName,
            eventDate: Timestamp.fromDate(new Date(bookingData.eventDate)), // Convert ISO string to Timestamp
            ticketsBooked: bookingData.ticketsBooked,
            totalPrice: bookingData.totalPrice,
            paymentDetails: bookingData.paymentDetails,
            status: "confirmed" as const,
            bookedAt: Timestamp.fromDate(new Date()), // Store as Timestamp
            checkedIn: false,
            checkedInAt: null, // Initialize checkedInAt as null
          };

          const bookingsRef = collection(db, "bookings");
          const docRef = await addDoc(bookingsRef, dataToStore);

          // Data to return to the client, conforming to the Booking interface (dates as ISO strings)
          const newBooking: Booking = {
            id: docRef.id,
            userId: bookingData.userId,
            eventId: bookingData.eventId,
            eventName: bookingData.eventName,
            eventDate: bookingData.eventDate, // Return the original ISO string for eventDate
            ticketsBooked: bookingData.ticketsBooked,
            totalPrice: bookingData.totalPrice,
            paymentDetails: bookingData.paymentDetails,
            status: "confirmed",
            bookedAt: dataToStore.bookedAt.toDate().toISOString(), // Convert stored Timestamp back to ISO string
            checkedIn: false,
            checkedInAt: null,
          };
          return { data: newBooking };
        } catch (error) {
          return handleError(error);
        }
      },
      invalidatesTags: ["Booking"],
    }),

    updateBookingStatus: builder.mutation<
      void,
      { id: string; status: Booking["status"] }
    >({
      async queryFn({ id, status }) {
        try {
          const docRef = doc(db, "bookings", id);
          await updateDoc(docRef, { status });
          return { data: undefined };
        } catch (error) {
          return handleError(error);
        }
      },
      invalidatesTags: ["Booking"],
    }),

    checkInBooking: builder.mutation<void, string>({
      async queryFn(bookingId) {
        try {
          const docRef = doc(db, "bookings", bookingId);
          await updateDoc(docRef, {
            checkedIn: true,
            checkedInAt: Timestamp.fromDate(new Date()), // Store as Timestamp
          });
          return { data: undefined };
        } catch (error) {
          return handleError(error);
        }
      },
      invalidatesTags: ["Booking"],
    }),

    cancelBooking: builder.mutation<void, string>({
      async queryFn(id) {
        try {
          const docRef = doc(db, "bookings", id);
          await updateDoc(docRef, { status: "cancelled" });
          return { data: undefined };
        } catch (error) {
          return handleError(error);
        }
      },
      invalidatesTags: ["Booking"],
    }),

    deleteBooking: builder.mutation<void, string>({
      async queryFn(id) {
        try {
          const docRef = doc(db, "bookings", id);
          await deleteDoc(docRef);
          return { data: undefined };
        } catch (error) {
          return handleError(error);
        }
      },
      invalidatesTags: ["Booking"],
    }),
  }),
});

export const {
  useGetBookingsQuery,
  useCancelBookingMutation,
  useCheckInBookingMutation,
  useCreateBookingMutation,
  useDeleteBookingMutation,
  useGetEventBookingsQuery,
  useUpdateBookingStatusMutation,
  useGetUserBookingsQuery,
} = bookingApi;

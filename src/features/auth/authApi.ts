import { UserRole, type User } from "@/types";
import {
  browserLocalPersistence,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "@firebase/auth";
import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { handleError } from "@/helpers/handleError";

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: fakeBaseQuery(),
  tagTypes: ["Auth"],
  endpoints: (builder) => ({
    register: builder.mutation<
      User,
      { email: string; password: string; name: string }
    >({
      async queryFn({ email, password, name }) {
        try {
          const userCredential = await createUserWithEmailAndPassword(
            auth,
            email,
            password
          );
          await updateProfile(userCredential.user, { displayName: name });

          const user: User = {
            id: userCredential.user.uid,
            email,
            name,
            role: UserRole.USER,
          };

          await setDoc(doc(db, "users", user.id), user);
          return { data: user };
        } catch (error) {
          return handleError(error);
        }
      },
      invalidatesTags: ["Auth"],
    }),

    login: builder.mutation<User, { email: string; password: string }>({
      async queryFn({ email, password }) {
        try {
          await setPersistence(auth, browserLocalPersistence);
          const userCredential = await signInWithEmailAndPassword(
            auth,
            email,
            password
          );

          

          // Fetch additional user data from Firestore
          const userDoc = await getDoc(
            doc(db, "users", userCredential.user.uid)
          );
          const userData = userDoc.data();

          const user: User = {
            id: userCredential.user.uid,
            email: userCredential.user.email!,
            name: userCredential.user.displayName!,
            role: userData?.role || UserRole.USER,
            avatar: userCredential.user.photoURL || undefined, // Added this line
          };
          return { data: user };
        } catch (error) {
          return handleError(error);
        }
      },
      invalidatesTags: ["Auth"],
    }),

    logout: builder.mutation<void, void>({
      async queryFn() {
        try {
          await signOut(auth);
          return { data: undefined };
        } catch (error) {
          return handleError(error);
        }
      },
      invalidatesTags: ["Auth"],
    }),

    forgotPassword: builder.mutation<void, string>({
      async queryFn(email) {
        try {
          await sendPasswordResetEmail(auth, email);
          return { data: undefined };
        } catch (error) {
          return handleError(error);
        }
      },
    }),

    resetPassword: builder.mutation<void, { token: string; password: string }>({
      async queryFn({ token, password }) {
        try {
          await confirmPasswordReset(auth, token, password);
          return { data: undefined };
        } catch (error) {
          return handleError(error);
        }
      },
    }),

    verifyEmail: builder.mutation<void, void>({
      async queryFn() {
        try {
          if (!auth.currentUser) throw new Error("No user logged in");
          await sendEmailVerification(auth.currentUser);
          return { data: undefined };
        } catch (error) {
          return handleError(error);
        }
      },
    }),
    updateProfile: builder.mutation<void, { name?: string; photoURL?: string }>(
      {
        async queryFn({ name, photoURL }) {
          try {
            if (!auth.currentUser) throw new Error("No user logged in");

            const updates: { displayName?: string; photoURL?: string } = {};
            if (name) updates.displayName = name;
            if (photoURL) updates.photoURL = photoURL;

            await updateProfile(auth.currentUser, updates);

            if (auth.currentUser.uid) {
              await setDoc(doc(db, "users", auth.currentUser.uid), updates, {
                merge: true,
              });
            }

            return { data: undefined };
          } catch (error) {
            return handleError(error);
          }
        },
        invalidatesTags: ["Auth"],
      }
    ),
    getAuthState: builder.query<User | null, void>({
      async queryFn() {
        return new Promise((resolve) => {
          const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (user) {
              const userDoc = await getDoc(doc(db, "users", user.uid));
              const userData = userDoc.data();
              const fullUser: User = {
                id: user.uid,
                email: user.email!,
                name: user.displayName || "",
                role: userData?.role || UserRole.USER,
                avatar: user.photoURL || userData?.photoURL,
              };
              resolve({ data: fullUser });
            } else {
              resolve({ data: null });
            }
            unsubscribe();
          });
        });
      },
      providesTags: ["Auth"],
    }),
  }),
});


export const {
  useRegisterMutation,
  useLoginMutation,
  useLogoutMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useVerifyEmailMutation,
  useUpdateProfileMutation,
  useGetAuthStateQuery,
} = authApi;

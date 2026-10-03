import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";
export type AuthState = { loading: boolean; session: Session | null; error: string | null; signIn: () => Promise<void>; signOut: () => Promise<void> };
export const AuthContext = createContext<AuthState>({ loading: false, session: null, error: null, signIn: async () => {}, signOut: async () => {} });
export const useAuth = () => useContext(AuthContext);

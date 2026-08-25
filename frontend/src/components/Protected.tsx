import { Navigate, Outlet } from "react-router-dom";
import { useAuth, roleHome } from "@/context/AuthContext";
import type { Role } from "@/api/types";
import { Spinner } from "./ui";

export function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page text-lime">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={roleHome[user.role]} replace />;
  }
  return <Outlet />;
}

/** Redirect already-logged-in users away from auth pages to their home. */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={roleHome[user.role]} replace />;
  return <>{children}</>;
}

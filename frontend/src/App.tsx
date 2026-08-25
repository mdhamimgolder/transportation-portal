import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth, RedirectIfAuthed } from "@/components/Protected";
import { DashboardLayout } from "@/layouts/DashboardLayout";

// Auth
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";

// Employee
import MyTransport from "@/pages/employee/MyTransport";
import WeeklySchedule from "@/pages/employee/WeeklySchedule";
import AdhocRequest from "@/pages/employee/AdhocRequest";
import EmployeeProfile from "@/pages/employee/Profile";

// Operations
import OpsOverview from "@/pages/operations/Overview";
import OpsWeekly from "@/pages/operations/WeeklyApprovals";
import OpsAdhoc from "@/pages/operations/AdhocTracking";
import OpsAddress from "@/pages/operations/AddressApprovals";
import Profiles from "@/pages/shared/Profiles";
import History from "@/pages/shared/History";

// Facilities
import RoutePlanning from "@/pages/facilities/RoutePlanning";
import FacAdhoc from "@/pages/facilities/AdhocTransport";

// Admin
import AdminOverview from "@/pages/admin/Overview";
import AdminUsers from "@/pages/admin/Users";
import BulkUpload from "@/pages/admin/BulkUpload";
import AuditLog from "@/pages/admin/AuditLog";

export default function App() {
  return (
    <Routes>
      {/* Public / auth */}
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <Login />
          </RedirectIfAuthed>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthed>
            <Register />
          </RedirectIfAuthed>
        }
      />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Employee */}
      <Route element={<RequireAuth roles={["employee"]} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/employee" element={<MyTransport />} />
          <Route path="/employee/weekly" element={<WeeklySchedule />} />
          <Route path="/employee/adhoc" element={<AdhocRequest />} />
          <Route path="/employee/profile" element={<EmployeeProfile />} />
        </Route>
      </Route>

      {/* Operations */}
      <Route element={<RequireAuth roles={["operations", "super_admin"]} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/operations" element={<OpsOverview />} />
          <Route path="/operations/weekly" element={<OpsWeekly />} />
          <Route path="/operations/adhoc" element={<OpsAdhoc />} />
          <Route path="/operations/address" element={<OpsAddress />} />
          <Route path="/operations/profiles" element={<Profiles />} />
          <Route path="/operations/history" element={<History />} />
        </Route>
      </Route>

      {/* Facilities */}
      <Route element={<RequireAuth roles={["facilities", "super_admin"]} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/facilities" element={<RoutePlanning />} />
          <Route path="/facilities/adhoc" element={<FacAdhoc />} />
          <Route path="/facilities/profiles" element={<Profiles />} />
          <Route path="/facilities/history" element={<History />} />
        </Route>
      </Route>

      {/* Super Admin */}
      <Route element={<RequireAuth roles={["super_admin"]} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/admin" element={<AdminOverview />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/bulk" element={<BulkUpload />} />
          <Route path="/admin/audit" element={<AuditLog />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

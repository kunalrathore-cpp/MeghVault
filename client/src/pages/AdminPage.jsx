import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { AdminHeader } from "../components/admin/AdminHeader";
import { AdminMetricCards } from "../components/admin/AdminMetricCards";
import { UserManagementTable } from "../components/admin/UserManagementTable";
import { DeleteUserModal } from "../components/admin/DeleteUserModal";
import { UserDetailsModal } from "../components/admin/UserDetailsModal";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { useToast } from "../context/ToastContext";
import { adminService } from "../services/adminService";

export function AdminPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [activeFilter, setActiveFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Modals state
  const [deleteModalUser, setDeleteModalUser] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [detailsModalUser, setDetailsModalUser] = useState(null);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Fetch telemetry and filtered users
  const fetchData = useCallback(
    async (showLoadingSpinner = false) => {
      if (showLoadingSpinner) setIsLoading(true);
      try {
        const [statsData, usersData] = await Promise.all([
          adminService.getAdminStats(),
          adminService.getUsers({ filter: activeFilter, search: searchTerm }),
        ]);
        setStats(statsData);
        setUsers(usersData);
        if (activeFilter === "all" && !searchTerm) {
          setTotalUsersCount(usersData.length);
        } else if (statsData?.totalUsers) {
          setTotalUsersCount(statsData.totalUsers);
        }
      } catch (err) {
        console.error("Failed to load admin telemetry:", err);
        addToast({
          type: "error",
          title: "Failed to load data",
          message: "Could not retrieve administrative records.",
        });
      } finally {
        if (showLoadingSpinner) setIsLoading(false);
      }
    },
    [activeFilter, searchTerm, addToast]
  );

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Handle manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await adminService.refreshData();
      await fetchData(false);
      addToast({
        type: "success",
        title: "Telemetry Refreshed",
        message: "Latest administrative metrics and users synchronized.",
      });
    } catch {
      addToast({
        type: "error",
        title: "Refresh Failed",
        message: "Could not refresh administrative telemetry.",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle Logout user session
  const handleLogoutUser = async (user) => {
    if (user.status !== "Active") {
      addToast({
        type: "info",
        title: "Already Logged Out",
        message: `${user.name} does not have any active sessions.`,
      });
      return;
    }
    try {
      await adminService.logoutUser(user.id);
      addToast({
        type: "info",
        title: "Session Terminated",
        message: `${user.name}'s active session was invalidated.`,
      });
      // Refresh local list state
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: "Logged Out" } : u))
      );
      // Update stats
      setStats((prev) =>
        prev
          ? {
              ...prev,
              activeUsers: Math.max(0, prev.activeUsers - 1),
            }
          : prev
      );
    } catch (err) {
      addToast({
        type: "error",
        title: "Action Failed",
        message: err.message || `Failed to log out ${user.name}.`,
      });
    }
  };

  // Handle Delete user account
  const handleConfirmDelete = async (userId) => {
    setIsDeleting(true);
    try {
      await adminService.deleteUser(userId);
      addToast({
        type: "success",
        title: "User Deleted",
        message: `${deleteModalUser?.name || "User"} account has been removed.`,
      });
      setDeleteModalUser(null);
      await fetchData(false);
    } catch (err) {
      addToast({
        type: "error",
        title: "Deletion Failed",
        message: err.message || "Could not delete user account.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Update User Role (RBAC: "Admin" | "User")
  const handleUpdateRole = async (userId, newRole) => {
    setIsUpdatingRole(true);
    try {
      await adminService.updateUserRole(userId, newRole);
      addToast({
        type: "success",
        title: "Role Updated",
        message: `${detailsModalUser?.name || "User"} role changed to ${newRole}.`,
      });
      setDetailsModalUser(null);
      await fetchData(false);
    } catch (err) {
      addToast({
        type: "error",
        title: "Update Failed",
        message: err.message || "Could not update user role.",
      });
    } finally {
      setIsUpdatingRole(false);
    }
  };

  return (
    <AppLayout showNavbar={false}>
      {({ isSidebarCollapsed, onToggleSidebar }) => (
        <div className="admin-page-container">
          {/* Header with Admin Title, Expand Button (when collapsed), and Admin Identity */}
          <AdminHeader
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={onToggleSidebar}
          />

          {isLoading ? (
            <div className="admin-loading-state">
              <LoadingSpinner size="lg" message="Loading admin telemetry..." />
            </div>
          ) : (
            <>
              {/* 3 Metric Cards (Total Users, Active Users, Storage Used) */}
              <AdminMetricCards stats={stats} />

              {/* Main User Management Table (Full Width) */}
              <UserManagementTable
                users={users}
                totalCount={totalUsersCount}
                activeFilter={activeFilter}
                onFilterChange={setActiveFilter}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
                onLogoutUser={handleLogoutUser}
                onDeleteUser={(u) => setDeleteModalUser(u)}
                onEditRole={(u) => setDetailsModalUser(u)}
                onViewFiles={(u) => navigate(`/admin/users/${u.id}`)}
              />
            </>
          )}

          {/* Delete Confirmation Modal */}
          <DeleteUserModal
            isOpen={!!deleteModalUser}
            user={deleteModalUser}
            isDeleting={isDeleting}
            onClose={() => setDeleteModalUser(null)}
            onConfirm={handleConfirmDelete}
          />

          {/* User Details & RBAC Role Modal (Admin | User) */}
          <UserDetailsModal
            isOpen={!!detailsModalUser}
            user={detailsModalUser}
            isUpdating={isUpdatingRole}
            onClose={() => setDetailsModalUser(null)}
            onUpdateRole={handleUpdateRole}
          />
        </div>
      )}
    </AppLayout>
  );
}

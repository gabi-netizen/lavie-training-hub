import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Users as UsersIcon,
  Trash2,
  ShieldCheck,
  UserCheck,
  UserX,
  Search,
  UserPlus,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface UserRow {
  id: number;
  name: string | null;
  email: string | null;
  role: "user" | "admin";
  active: boolean;
  team: "opening" | "retention" | null;
  createdAt: Date;
  lastSignedIn: Date;
}

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-indigo-100 text-indigo-800 border-indigo-200",
  user: "bg-gray-100 text-gray-700 border-gray-200",
};

const TEAM_BADGE: Record<string, string> = {
  opening: "bg-blue-100 text-blue-800 border-blue-200",
  retention: "bg-amber-100 text-amber-800 border-amber-200",
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function Users() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  // Add User modal state
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"user" | "admin">("user");
  const [emailError, setEmailError] = useState("");

  const utils = trpc.useUtils();

  const { data: allUsers = [], isLoading } = trpc.users.getUsers.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const toggleMutation = trpc.users.toggleUserAccess.useMutation({
    onSuccess: (_data, variables) => {
      utils.users.getUsers.invalidate();
      const targetUser = allUsers.find((u) => u.id === variables.userId);
      const newState = !targetUser?.active;
      toast.success(
        newState
          ? `${targetUser?.name || "User"} has been enabled`
          : `${targetUser?.name || "User"} has been disabled`
      );
    },
    onError: (err) => {
      toast.error(err.message || "Failed to toggle user access");
    },
  });

  const deleteMutation = trpc.users.deleteUser.useMutation({
    onSuccess: () => {
      utils.users.getUsers.invalidate();
      toast.success(`${deleteTarget?.name || "User"} has been deleted`);
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to delete user");
      setDeleteTarget(null);
    },
  });

  const addUserMutation = trpc.users.addUser.useMutation({
    onSuccess: () => {
      utils.users.getUsers.invalidate();
      toast.success("User added successfully");
      resetAddUserForm();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to add user");
    },
  });

  function resetAddUserForm() {
    setAddUserOpen(false);
    setNewUserName("");
    setNewUserEmail("");
    setNewUserRole("user");
    setEmailError("");
  }

  function handleAddUserSubmit() {
    // Validate email
    if (!newUserEmail.trim()) {
      setEmailError("Email is required");
      return;
    }
    if (!isValidEmail(newUserEmail.trim())) {
      setEmailError("Please enter a valid email address");
      return;
    }
    setEmailError("");

    addUserMutation.mutate({
      name: newUserName.trim() || undefined,
      email: newUserEmail.trim(),
      role: newUserRole,
    });
  }

  // Redirect non-admin users
  if (!loading && user && user.role !== "admin") {
    navigate("/training");
    return null;
  }

  // Filter users by search
  const filteredUsers = useMemo(() => {
    if (!search.trim()) return allUsers;
    const q = search.toLowerCase();
    return allUsers.filter(
      (u) =>
        (u.name?.toLowerCase().includes(q)) ||
        (u.email?.toLowerCase().includes(q)) ||
        u.role.toLowerCase().includes(q)
    );
  }, [allUsers, search]);

  // Stats
  const totalUsers = allUsers.length;
  const adminCount = allUsers.filter((u) => u.role === "admin").length;
  const activeCount = allUsers.filter((u) => u.active).length;
  const disabledCount = allUsers.filter((u) => !u.active).length;

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <UsersIcon size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Users Management</h1>
            <p className="text-sm text-gray-500">Manage users and access</p>
          </div>
        </div>
        <Button
          onClick={() => setAddUserOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <UserPlus size={16} className="mr-2" />
          Add User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-medium">Total Users</p>
            <p className="text-2xl font-bold text-gray-900">{totalUsers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-medium">Admins</p>
            <p className="text-2xl font-bold text-indigo-600">{adminCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-medium">Active</p>
            <p className="text-2xl font-bold text-green-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 font-medium">Disabled</p>
            <p className="text-2xl font-bold text-red-600">{disabledCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search by name, email, or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Team</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Last Sign In</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Active</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      {search ? "No users match your search" : "No users found"}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = u.id === user?.id;
                    return (
                      <tr
                        key={u.id}
                        className={cn(
                          "border-b border-gray-100 hover:bg-gray-50 transition-colors",
                          !u.active && "opacity-60 bg-red-50/30"
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">
                              {u.name || "—"}
                            </span>
                            {isSelf && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 font-medium">
                                You
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{u.email || "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
                              ROLE_BADGE[u.role]
                            )}
                          >
                            {u.role === "admin" && <ShieldCheck size={10} />}
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {u.team ? (
                            <span
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                                TEAM_BADGE[u.team]
                              )}
                            >
                              {u.team}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {u.active ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                              <UserCheck size={12} />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                              <UserX size={12} />
                              Disabled
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {u.lastSignedIn
                            ? new Date(u.lastSignedIn).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Switch
                            checked={u.active}
                            disabled={isSelf || toggleMutation.isPending}
                            onCheckedChange={() =>
                              toggleMutation.mutate({ userId: u.id })
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSelf || deleteMutation.isPending}
                            onClick={() => setDeleteTarget(u as UserRow)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            title={isSelf ? "You cannot delete yourself" : "Delete user"}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete{" "}
              <strong>{deleteTarget?.name || deleteTarget?.email || "this user"}</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate({ userId: deleteTarget.id });
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add User Dialog */}
      <Dialog open={addUserOpen} onOpenChange={(open) => { if (!open) resetAddUserForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Add a user to the whitelist. They will be able to sign in via Clerk once added.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-user-name">Name</Label>
              <Input
                id="add-user-name"
                placeholder="Full name (optional)"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-user-email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="add-user-email"
                type="email"
                placeholder="user@example.com"
                value={newUserEmail}
                onChange={(e) => {
                  setNewUserEmail(e.target.value);
                  if (emailError) setEmailError("");
                }}
                className={emailError ? "border-red-500" : ""}
              />
              {emailError && (
                <p className="text-xs text-red-500">{emailError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-user-role">Role</Label>
              <Select value={newUserRole} onValueChange={(val) => setNewUserRole(val as "user" | "admin")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetAddUserForm}>
              Cancel
            </Button>
            <Button
              onClick={handleAddUserSubmit}
              disabled={addUserMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {addUserMutation.isPending ? "Adding..." : "Add User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

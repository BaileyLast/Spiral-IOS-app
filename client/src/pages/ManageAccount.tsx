import { useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Instagram,
  ChevronRight,
  Mail,
  User,
  Calendar,
  MapPin,
  Check,
  X,
  Loader2,
  Plus,
} from "lucide-react";

interface CustomerProfile {
  id: string;
  email: string;
  name?: string;
  emailVerified: boolean;
  instagramHandle?: string;
  instagramUserId?: string;
  instagramProfilePicture?: string;
  instagramAccountType?: string;
  followerCount?: number;
  dateOfBirth?: string;
  address?: string;
}

function formatFollowerCount(count: number | null | undefined): string {
  if (count === null || count === undefined) return "";
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return count.toString();
}

type EditingField = "name" | "dateOfBirth" | "address" | null;

export default function ManageAccount() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [editValue, setEditValue] = useState("");

  const { data: profile, isLoading } = useQuery<CustomerProfile>({
    queryKey: ["/api/customer/me"],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { name?: string; dateOfBirth?: string | null; address?: string | null }) => {
      const response = await apiRequest("PATCH", "/api/customer/profile", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Updated", description: "Your info has been saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });
      setEditingField(null);
    },
    onError: () => {
      toast({ title: "Failed to save", description: "Please try again", variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/customer/disconnect-instagram");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Instagram disconnected", description: "Your Instagram account has been unlinked" });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer/stats"] });
    },
    onError: () => {
      toast({ title: "Failed to disconnect", description: "Please try again", variant: "destructive" });
    },
  });

  const startEditing = (field: EditingField, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue || "");
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue("");
  };

  const saveField = () => {
    if (!editingField) return;
    const data: Record<string, string | null> = {};
    data[editingField] = editValue.trim() || null;
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  const isInstagramConnected = !!profile?.instagramHandle;

  const accountFields = [
    {
      key: "email" as const,
      label: "Email address",
      value: profile?.email || "",
      icon: Mail,
      editable: false,
    },
    {
      key: "name" as const,
      label: "Name",
      value: profile?.name || "",
      icon: User,
      editable: true,
    },
    {
      key: "dateOfBirth" as const,
      label: "Date of birth",
      value: profile?.dateOfBirth || "",
      icon: Calendar,
      editable: true,
    },
    {
      key: "address" as const,
      label: "Address",
      value: profile?.address || "",
      icon: MapPin,
      editable: true,
    },
  ];

  return (
    <div className="min-h-screen safe-top">
      <header className="px-6 pt-8 pb-6 flex items-center gap-3">
        <button
          onClick={() => setLocation("/profile")}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover-elevate"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="text-2xl font-semibold text-white">Manage account</h1>
      </header>

      <main className="px-6 pb-8 space-y-6">
        {isInstagramConnected ? (
          <div
            className="p-5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10"
            data-testid="card-instagram-connected"
          >
            <div className="flex items-center gap-4">
              <Avatar className="w-14 h-14 border-2 border-white/20">
                {profile?.instagramProfilePicture ? (
                  <AvatarImage
                    src="/api/customer/instagram-avatar"
                    alt={profile.instagramHandle || "Instagram"}
                  />
                ) : null}
                <AvatarFallback className="bg-gradient-to-br from-purple-400 to-pink-400 text-white text-xl font-semibold">
                  <Instagram className="w-6 h-6" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate" data-testid="text-instagram-handle">
                  @{profile?.instagramHandle}
                </p>
                {profile?.followerCount != null && (
                  <p className="text-sm text-white/50 mt-0.5 flex items-center gap-1">
                    <Instagram className="w-3 h-3" />
                    {formatFollowerCount(profile.followerCount)} followers
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="w-full mt-4 py-2.5 rounded-xl bg-white/10 text-white/70 text-sm font-medium hover-elevate transition-colors"
              data-testid="button-disconnect-instagram"
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                "Disconnect Instagram"
              )}
            </button>
          </div>
        ) : (
          <div
            className="p-5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 cursor-pointer hover-elevate"
            onClick={() => setLocation("/connect-instagram")}
            data-testid="card-connect-instagram"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
                <Instagram className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-white">Connect Instagram</p>
                <p className="text-sm text-white/50">Link your account to unlock discounts</p>
              </div>
              <Plus className="w-5 h-5 text-white/40" />
            </div>
          </div>
        )}

        <div>
          <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider mb-3 px-1" data-testid="text-section-label">
            Spiral account info
          </h2>
          <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 overflow-hidden">
            <div className="divide-y divide-white/10">
              {accountFields.map((field) => {
                const isEditing = editingField === field.key;
                const Icon = field.icon;

                return (
                  <div key={field.key} className="p-4" data-testid={`field-${field.key}`}>
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-white/50" />
                          <span className="text-xs text-white/50 uppercase tracking-wider">{field.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/30 focus-visible:ring-white/30"
                            placeholder={`Enter ${field.label.toLowerCase()}`}
                            autoFocus
                            data-testid={`input-${field.key}`}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={saveField}
                            disabled={updateMutation.isPending}
                            data-testid={`button-save-${field.key}`}
                          >
                            {updateMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin text-white/50" />
                            ) : (
                              <Check className="w-4 h-4 text-green-400" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={cancelEditing}
                            data-testid={`button-cancel-${field.key}`}
                          >
                            <X className="w-4 h-4 text-white/50" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className={`w-full flex items-center gap-3 ${field.editable ? "hover-elevate" : ""}`}
                        onClick={() => {
                          if (field.editable) {
                            startEditing(field.key as EditingField, field.value);
                          }
                        }}
                        disabled={!field.editable}
                        data-testid={`button-edit-${field.key}`}
                      >
                        <Icon className="w-5 h-5 text-white/50 flex-shrink-0" />
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-xs text-white/40 mb-0.5">{field.label}</p>
                          <p className={`text-sm truncate ${field.value ? "text-white" : "text-white/30"}`}>
                            {field.value || "Not set"}
                          </p>
                        </div>
                        {field.editable && (
                          <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

import { useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { COUNTRIES, getCountryByCode } from "@/lib/countries";
import {
  ArrowLeft,
  Instagram,
  ChevronRight,
  Mail,
  User,
  Calendar,
  MapPin,
  Globe,
  Check,
  X,
  Loader2,
  Plus,
} from "lucide-react";

interface CustomerProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  emailVerified: boolean;
  instagramHandle?: string;
  instagramUserId?: string;
  instagramProfilePicture?: string;
  instagramAccountType?: string;
  followerCount?: number;
  dateOfBirth?: string;
  address?: string;
  country?: string;
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

type EditingField = "firstName" | "lastName" | "dateOfBirth" | "address" | "country" | null;

export default function ManageAccount() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [editValue, setEditValue] = useState("");
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);

  const { data: profile, isLoading } = useQuery<CustomerProfile>({
    queryKey: ["/api/customer/me"],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { firstName?: string | null; lastName?: string | null; dateOfBirth?: string | null; address?: string | null; country?: string | null }) => {
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

  const startEditing = (field: Exclude<EditingField, null>, currentValue: string) => {
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

  const saveCountry = (code: string | null) => {
    setCountryPickerOpen(false);
    updateMutation.mutate({ country: code });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#D62976]" />
      </div>
    );
  }

  const isInstagramConnected = !!profile?.instagramHandle;
  const currentCountry = getCountryByCode(profile?.country);

  const accountFields = [
    { key: "email" as const, label: "Email address", value: profile?.email || "", icon: Mail, editable: false },
    { key: "firstName" as const, label: "First name", value: profile?.firstName || "", icon: User, editable: true },
    { key: "lastName" as const, label: "Last name", value: profile?.lastName || "", icon: User, editable: true },
    { key: "dateOfBirth" as const, label: "Date of birth", value: profile?.dateOfBirth || "", icon: Calendar, editable: true },
    { key: "address" as const, label: "Address", value: profile?.address || "", icon: MapPin, editable: true },
  ];

  return (
    <div className="min-h-screen safe-top bg-white">
      <header className="px-6 pt-8 pb-6 flex items-center gap-3">
        <button
          onClick={() => setLocation("/profile")}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover-elevate"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Manage account</h1>
      </header>

      <main className="px-6 pb-8 space-y-6">
        {isInstagramConnected ? (
          <div
            className="p-5 rounded-2xl bg-gray-50 border border-gray-100"
            data-testid="card-instagram-connected"
          >
            <div className="flex items-center gap-4">
              <Avatar className="w-14 h-14 border-2 border-gray-100">
                {profile?.instagramProfilePicture ? (
                  <AvatarImage
                    src="/api/customer/instagram-avatar"
                    alt={profile.instagramHandle || "Instagram"}
                  />
                ) : null}
                <AvatarFallback className="text-white text-xl font-bold" style={{ background: 'linear-gradient(135deg, #FA7E1E, #D62976)' }}>
                  <Instagram className="w-6 h-6" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate" data-testid="text-instagram-handle">
                  @{profile?.instagramHandle}
                </p>
                {profile?.followerCount != null && (
                  <p className="text-sm text-gray-400 mt-0.5 flex items-center gap-1">
                    <Instagram className="w-3 h-3" />
                    {formatFollowerCount(profile.followerCount)} followers
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="w-full mt-4 py-2.5 rounded-xl bg-gray-100 text-gray-500 text-sm font-medium hover-elevate transition-colors"
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
            className="p-5 rounded-2xl bg-gray-50 border border-gray-100 cursor-pointer hover-elevate"
            onClick={() => setLocation("/connect-instagram")}
            data-testid="card-connect-instagram"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FA7E1E, #D62976)' }}>
                <Instagram className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">Connect Instagram</p>
                <p className="text-sm text-gray-400">Link your account to unlock discounts</p>
              </div>
              <Plus className="w-5 h-5 text-gray-300" />
            </div>
          </div>
        )}

        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1" data-testid="text-section-label">
            Spiral account info
          </h2>
          <div className="rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {accountFields.map((field) => {
                const isEditing = editingField === field.key;
                const Icon = field.icon;

                return (
                  <div key={field.key} className="p-4" data-testid={`field-${field.key}`}>
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-gray-400" />
                          <span className="text-xs text-gray-400 uppercase tracking-wider">{field.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1 bg-white border-gray-200 text-gray-900 placeholder:text-gray-300 focus-visible:ring-[#D62976]/20 focus-visible:border-[#D62976]"
                            placeholder={`Enter ${field.label.toLowerCase()}`}
                            autoFocus
                            data-testid={`input-${field.key}`}
                          />
                          <Button size="icon" variant="ghost" onClick={saveField} disabled={updateMutation.isPending} data-testid={`button-save-${field.key}`}>
                            {updateMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                            ) : (
                              <Check className="w-4 h-4 text-green-600" />
                            )}
                          </Button>
                          <Button size="icon" variant="ghost" onClick={cancelEditing} data-testid={`button-cancel-${field.key}`}>
                            <X className="w-4 h-4 text-gray-400" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className={`w-full flex items-center gap-3 ${field.editable ? "hover-elevate" : ""}`}
                        onClick={() => {
                          if (field.editable) {
                            startEditing(field.key as Exclude<EditingField, null>, field.value);
                          }
                        }}
                        disabled={!field.editable}
                        data-testid={`button-edit-${field.key}`}
                      >
                        <Icon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-xs text-gray-400 mb-0.5">{field.label}</p>
                          <p className={`text-sm truncate ${field.value ? "text-gray-900" : "text-gray-300"}`}>
                            {field.value || "Not set"}
                          </p>
                        </div>
                        {field.editable && (
                          <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Country picker */}
              <div className="p-4" data-testid="field-country">
                <Popover open={countryPickerOpen} onOpenChange={setCountryPickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className="w-full flex items-center gap-3 hover-elevate"
                      data-testid="button-edit-country"
                    >
                      <Globe className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-xs text-gray-400 mb-0.5">Country</p>
                        <p className={`text-sm truncate ${currentCountry ? "text-gray-900" : "text-gray-300"}`}>
                          {currentCountry?.name || "Not set"}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Search country..." data-testid="input-country-search" />
                      <CommandList>
                        <CommandEmpty>No country found.</CommandEmpty>
                        <CommandGroup>
                          {COUNTRIES.map((c) => (
                            <CommandItem
                              key={c.code}
                              value={c.name}
                              onSelect={() => saveCountry(c.code)}
                              data-testid={`option-country-${c.code}`}
                            >
                              <span className="flex-1">{c.name}</span>
                              {profile?.country === c.code && (
                                <Check className="w-4 h-4 text-[#D62976]" />
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { apiRequest, queryClient, setAuthToken } from "@/lib/queryClient";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useInstagramAvatar } from "@/hooks/use-instagram-avatar";
import { useToast } from "@/hooks/use-toast";
import { COUNTRIES, getCountryByCode, detectCountryFromLocale } from "@/lib/countries";
import { isNativeAddressLookupAvailable, requestNativeAddressLookup } from "@/lib/native";
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
  Trash2,
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
  gender?: string;
  address?: string;
  city?: string;
  county?: string;
  postcode?: string;
  country?: string;
}

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

function genderLabel(value: string | undefined): string {
  return GENDER_OPTIONS.find((o) => o.value === value)?.label || "";
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

type EditingField =
  | "firstName"
  | "lastName"
  | "dateOfBirth"
  | "address"
  | "city"
  | "county"
  | "postcode"
  | "country"
  | null;

export default function ManageAccount() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [editValue, setEditValue] = useState("");
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [genderPickerOpen, setGenderPickerOpen] = useState(false);
  const [addressLookupBusy, setAddressLookupBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: profile, isLoading, error: profileError } = useQuery<CustomerProfile>({
    queryKey: ["/api/customer/me"],
  });

  // If the session has expired, redirect to login instead of rendering an empty
  // signed-in shell.
  useAuthGuard(profileError);

  const avatarUrl = useInstagramAvatar(!!profile?.instagramProfilePicture);

  const updateMutation = useMutation({
    mutationFn: async (data: { firstName?: string | null; lastName?: string | null; dateOfBirth?: string | null; gender?: string | null; address?: string | null; city?: string | null; county?: string | null; postcode?: string | null; country?: string | null }) => {
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

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      try {
        await apiRequest("POST", "/api/customer/push-token", { token: null });
      } catch (err) {
        console.warn("[push-token] clear on delete failed", err);
      }
      await apiRequest("DELETE", "/api/customer/me");
    },
    onSuccess: () => {
      setAuthToken(null);
      localStorage.removeItem("spiral_customer");
      localStorage.removeItem("spiral_signup_token");
      queryClient.clear();
      setDeleteOpen(false);
      toast({ title: "Account deleted", description: "Your Spiral account has been permanently removed." });
      setLocation("/");
    },
    onError: () => {
      toast({
        title: "Couldn't delete account",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
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
    const newValue = editValue.trim() || null;
    // Send only what changed — an unchanged value is a no-op, not a PATCH.
    const currentValue = (profile?.[editingField as keyof CustomerProfile] as string | undefined)?.trim() || null;
    if (newValue === currentValue) {
      setEditingField(null);
      setEditValue("");
      return;
    }
    const data: Record<string, string | null> = {};
    data[editingField] = newValue;
    updateMutation.mutate(data);
  };

  const saveCountry = (code: string | null) => {
    setCountryPickerOpen(false);
    updateMutation.mutate({ country: code });
  };

  const saveGender = (value: string | null) => {
    setGenderPickerOpen(false);
    // null clears the stored gender server-side.
    updateMutation.mutate({ gender: value });
  };

  // Native iOS address autocomplete (optional bridge). When it returns a pick
  // we save every populated part in one PATCH; cancel/missing bridge is a no-op.
  const runAddressLookup = async () => {
    setAddressLookupBusy(true);
    try {
      const result = await requestNativeAddressLookup();
      if (result && (result.address || result.city || result.county || result.postcode || result.country)) {
        updateMutation.mutate({
          ...(result.address !== undefined && { address: result.address }),
          ...(result.city !== undefined && { city: result.city }),
          ...(result.county !== undefined && { county: result.county }),
          ...(result.postcode !== undefined && { postcode: result.postcode }),
          ...(result.country !== undefined && { country: result.country }),
        });
      }
    } finally {
      setAddressLookupBusy(false);
    }
  };

  const suggestedCountryCode = useMemo(() => detectCountryFromLocale(), []);

  if (isLoading) {
    return (
      <div className="min-h-screen-safe flex items-center justify-center bg-warm">
        <Loader2 className="w-8 h-8 animate-spin text-[#4ECCA3]" />
      </div>
    );
  }

  const isInstagramConnected = !!profile?.instagramHandle;
  const currentCountry = getCountryByCode(profile?.country);
  const suggestedCountry = !profile?.country ? getCountryByCode(suggestedCountryCode) : undefined;

  const accountFields = [
    { key: "email" as const, label: "Email address", value: profile?.email || "", icon: Mail, editable: false },
    { key: "firstName" as const, label: "First name", value: profile?.firstName || "", icon: User, editable: true },
    { key: "lastName" as const, label: "Last name", value: profile?.lastName || "", icon: User, editable: true },
    { key: "dateOfBirth" as const, label: "Date of birth", value: profile?.dateOfBirth || "", icon: Calendar, editable: true },
    { key: "address" as const, label: "Street address", value: profile?.address || "", icon: MapPin, editable: true },
    { key: "city" as const, label: "City", value: profile?.city || "", icon: MapPin, editable: true },
    { key: "county" as const, label: "County", value: profile?.county || "", icon: MapPin, editable: true },
    { key: "postcode" as const, label: "Postcode", value: profile?.postcode || "", icon: MapPin, editable: true },
  ];

  return (
    <div className="min-h-screen-safe bg-warm safe-top pb-12">
      <header className="px-4 py-4 flex items-center justify-between sticky top-0 bg-[#FCFCFB]/80 backdrop-blur-md z-10">
        <Link href="/profile">
          <button
            className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center hover-elevate"
            data-testid="button-back"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-900" />
          </button>
        </Link>
        <div className="flex items-center gap-2 bg-white px-4 py-1.5 rounded-full shadow-sm">
          <span className="text-sm font-bold text-gray-900">Manage account</span>
        </div>
        <div className="w-10" />
      </header>

      <main className="px-5 mt-4 space-y-6">
        {/* Instagram card */}
        {isInstagramConnected ? (
          <div className="creator-card p-5" data-testid="card-instagram-connected">
            <div className="flex items-center gap-4">
              <Avatar className="w-14 h-14 border-2 border-white shadow-sm">
                {avatarUrl ? (
                  <AvatarImage
                    src={avatarUrl}
                    alt={profile?.instagramHandle || "Instagram"}
                  />
                ) : null}
                <AvatarFallback className="bg-[#4ECCA3] text-white">
                  <Instagram className="w-6 h-6" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-black text-gray-900 truncate" data-testid="text-instagram-handle">
                  @{profile?.instagramHandle}
                </p>
                {profile?.followerCount != null && (
                  <p className="text-sm font-bold text-gray-500 mt-0.5 flex items-center gap-1">
                    <Instagram className="w-3 h-3" />
                    {formatFollowerCount(profile.followerCount)} followers
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="destructive"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="w-full mt-4 rounded-full h-12 font-bold"
              data-testid="button-disconnect-instagram"
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Disconnect Instagram"
              )}
            </Button>
          </div>
        ) : (
          <div
            className="creator-card p-5 hover-elevate cursor-pointer"
            onClick={() => setLocation("/home")}
            data-testid="card-connect-instagram"
          >
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #A8F5E0, #4ECCA3, #2BAE88)" }}
              >
                <Instagram className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-black text-gray-900">Connect Instagram</p>
                <p className="text-sm font-medium text-gray-500">Link your account to unlock discounts</p>
              </div>
              <Plus className="w-5 h-5 text-gray-300" />
            </div>
          </div>
        )}

        {/* Account info card */}
        <div>
          <h2
            className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 px-2"
            data-testid="text-section-label"
          >
            Spiral account info
          </h2>
          <div className="creator-card p-2">
            {accountFields.map((field) => {
              const isEditing = editingField === field.key;
              const Icon = field.icon;

              return (
                <div key={field.key} className="p-3" data-testid={`field-${field.key}`}>
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-[#1A996E]" />
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          {field.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type={field.key === "dateOfBirth" ? "date" : "text"}
                          max={field.key === "dateOfBirth" ? new Date().toISOString().slice(0, 10) : undefined}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 rounded-2xl bg-gray-50 border-gray-100 text-gray-900 font-medium placeholder:text-gray-300 focus-visible:ring-[#4ECCA3]/20 focus-visible:border-[#4ECCA3] h-12"
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
                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                          ) : (
                            <Check className="w-4 h-4 text-[#1A996E]" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={cancelEditing}
                          data-testid={`button-cancel-${field.key}`}
                        >
                          <X className="w-4 h-4 text-gray-400" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className={`w-full flex items-center gap-3 p-2 rounded-2xl text-left ${field.editable ? "hover-elevate" : ""}`}
                      onClick={() => {
                        if (field.editable) {
                          startEditing(field.key as Exclude<EditingField, null>, field.value);
                        }
                      }}
                      disabled={!field.editable}
                      data-testid={`button-edit-${field.key}`}
                    >
                      <div className="w-10 h-10 rounded-2xl bg-[#E6F8F0] flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-[#1A996E]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                          {field.label}
                        </p>
                        <p className={`text-sm font-bold truncate ${field.value ? "text-gray-900" : "text-gray-300"}`}>
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

            {/* Native address autocomplete — only rendered when the iOS shell
                provides the bridge; on the web this button simply isn't there. */}
            {isNativeAddressLookupAvailable() && (
              <div className="p-3" data-testid="field-address-lookup">
                <button
                  className="w-full flex items-center gap-3 p-2 rounded-2xl hover-elevate text-left"
                  onClick={runAddressLookup}
                  disabled={addressLookupBusy || updateMutation.isPending}
                  data-testid="button-address-lookup"
                >
                  <div className="w-10 h-10 rounded-2xl bg-[#E6F8F0] flex items-center justify-center flex-shrink-0">
                    {addressLookupBusy ? (
                      <Loader2 className="w-5 h-5 animate-spin text-[#1A996E]" />
                    ) : (
                      <MapPin className="w-5 h-5 text-[#1A996E]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#1A996E]">Find my address</p>
                    <p className="text-xs font-medium text-gray-400">Search and fill your address automatically</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </button>
              </div>
            )}

            {/* Gender picker */}
            <div className="p-3" data-testid="field-gender">
              <Popover open={genderPickerOpen} onOpenChange={setGenderPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="w-full flex items-center gap-3 p-2 rounded-2xl hover-elevate text-left"
                    data-testid="button-edit-gender"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-[#E6F8F0] flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-[#1A996E]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                        Gender
                      </p>
                      <p className={`text-sm font-bold truncate ${profile?.gender ? "text-gray-900" : "text-gray-300"}`}>
                        {genderLabel(profile?.gender) || "Not set"}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-2" align="end">
                  <div className="space-y-1">
                    {GENDER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-900 hover-elevate text-left"
                        onClick={() => saveGender(opt.value)}
                        data-testid={`option-gender-${opt.value}`}
                      >
                        <span className="flex-1">{opt.label}</span>
                        {profile?.gender === opt.value && <Check className="w-4 h-4 text-[#4ECCA3]" />}
                      </button>
                    ))}
                    {profile?.gender && (
                      <button
                        className="w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover-elevate text-left"
                        onClick={() => saveGender(null)}
                        data-testid="option-gender-clear"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Country picker */}
            <div className="p-3" data-testid="field-country">
              <Popover open={countryPickerOpen} onOpenChange={setCountryPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="w-full flex items-center gap-3 p-2 rounded-2xl hover-elevate text-left"
                    data-testid="button-edit-country"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-[#E6F8F0] flex items-center justify-center flex-shrink-0">
                      <Globe className="w-5 h-5 text-[#1A996E]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                        Country
                      </p>
                      {currentCountry ? (
                        <p className="text-sm font-bold truncate text-gray-900">{currentCountry.name}</p>
                      ) : suggestedCountry ? (
                        <p className="text-sm font-bold truncate text-gray-400" data-testid="text-country-suggested">
                          Tap to confirm{" "}
                          <span className="text-gray-900 font-black">{suggestedCountry.name}</span>
                        </p>
                      ) : (
                        <p className="text-sm font-bold truncate text-gray-300">Not set</p>
                      )}
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
                              <Check className="w-4 h-4 text-[#4ECCA3]" />
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

        <div className="creator-card p-2">
          <button
            onClick={() => setDeleteOpen(true)}
            className="w-full flex items-center gap-4 p-4 rounded-2xl hover-elevate text-left"
            data-testid="button-delete-account"
          >
            <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-red-600">Delete account</p>
              <p className="text-xs text-red-400 font-medium">Permanently remove your data</p>
            </div>
            <ChevronRight className="w-5 h-5 text-red-200 flex-shrink-0" />
          </button>
        </div>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent data-testid="dialog-delete-account">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your Spiral account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes your profile, Instagram link, and verification codes.
                Your past order history will be anonymized but kept for the brands you bought from.
                This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={deleteAccountMutation.isPending}
                data-testid="button-cancel-delete-account"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  deleteAccountMutation.mutate();
                }}
                disabled={deleteAccountMutation.isPending}
                className="bg-red-500 text-white hover:bg-red-600"
                data-testid="button-confirm-delete-account"
              >
                {deleteAccountMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete account"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}

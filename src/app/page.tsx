"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { Camera, Check, LogOut, MapPin, Plus, UserPlus, X } from "lucide-react";
import { clsx } from "clsx";

const DrinkMap = dynamic(() => import("@/components/drink-map"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading map...</div>,
});

type User = { id: string; username: string; profilePhotoUrl?: string | null };
type Friend = { id: string; username: string; profilePhotoUrl?: string | null };
type FriendRequest = { id: string; username: string; createdAt: string };
type PinTagRequest = {
  id: string;
  pinId: string;
  creatorId: string;
  creatorUsername: string;
  placeLabel: string | null;
  pinType: "verified" | "forgotten";
  activityType: ActivityType;
  activityOtherLabel: string | null;
  pinCreatedAt: string;
  requestedAt: string;
  photoUrl: string | null;
};
type Stats = { totalPins: number; uniquePlaces: number; friendTaggedPins: number; forgottenPinsUsedThisWeek: number };
type CreditBalance = { freeGranted: number; paidGranted: number; consumed: number; remaining: number; periodMonth: string };
type ActivityType = "hangout" | "party" | "random_drive" | "bunking" | "other";
type PlaceSearchResult = { id: string; label: string; latitude: number; longitude: number };
type Pin = {
  id: string;
  creatorId: string;
  creatorUsername: string;
  latitude: number;
  longitude: number;
  placeLabel: string | null;
  pinType: "verified" | "forgotten";
  activityType: ActivityType;
  activityOtherLabel: string | null;
  createdAt: string;
  participants: Friend[];
  pendingParticipants: Friend[];
  photoUrl: string | null;
  creatorProfilePhotoUrl: string | null;
};
type SelectedPoint = { latitude: number; longitude: number };

declare global {
  interface Window {
    Razorpay?: new (options: {
      key: string;
      amount: number;
      currency: string;
      name: string;
      description: string;
      order_id: string;
      handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
      theme: { color: string };
    }) => { open: () => void };
  }
}

const activities: { value: ActivityType; label: string; icon: string }[] = [
  { value: "hangout", label: "Hangout", icon: "H" },
  { value: "party", label: "Party", icon: "P" },
  { value: "random_drive", label: "Random Drive", icon: "D" },
  { value: "bunking", label: "Bunking", icon: "B" },
  { value: "other", label: "Other", icon: "*" },
];

const placeSearchTypes = ["poi", "address", "road", "place", "locality", "neighbourhood", "municipality"].join(",");

function activityDisplay(activityType: ActivityType, otherLabel?: string | null) {
  const activity = activities.find((item) => item.value === activityType) ?? activities[0];
  return activityType === "other" && otherLabel ? otherLabel : activity.label;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data as T;
}

function placeSearchErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Place search failed";
  if (/key usage|invalid key|key is not valid|not valid/i.test(message)) {
    return "MapTiler rejected this preview domain/key. Add the Vercel preview domain to MapTiler allowed origins and check NEXT_PUBLIC_MAPTILER_API_KEY.";
  }
  return message || "Place search failed";
}

async function fileToDataUrl(file: File) {
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.8,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
  });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(compressed);
  });
}

export default function Home() {
  const [me, setMe] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [pinTagRequests, setPinTagRequests] = useState<PinTagRequest[]>([]);
  const [pins, setPins] = useState<Pin[]>([]);
  const [stats, setStats] = useState<Stats>({ totalPins: 0, uniquePlaces: 0, friendTaggedPins: 0, forgottenPinsUsedThisWeek: 0 });
  const [credits, setCredits] = useState<CreditBalance>({ freeGranted: 2, paidGranted: 0, consumed: 0, remaining: 2, periodMonth: "" });
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<SelectedPoint | null>(null);
  const [currentLocation, setCurrentLocation] = useState<SelectedPoint | null>(null);
  const [friendUsername, setFriendUsername] = useState("");
  const [pinType, setPinType] = useState<"verified" | "forgotten">("verified");
  const [placeLabel, setPlaceLabel] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("hangout");
  const [activityOtherLabel, setActivityOtherLabel] = useState("");
  const [tagged, setTagged] = useState<string[]>([]);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoDecisionMade, setPhotoDecisionMade] = useState(false);
  const [showProfileUploadPrompt, setShowProfileUploadPrompt] = useState(false);
  const [placeSearchQuery, setPlaceSearchQuery] = useState("");
  const [placeSearchResults, setPlaceSearchResults] = useState<PlaceSearchResult[]>([]);
  const [placeSearchMessage, setPlaceSearchMessage] = useState("");
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [manualPinMode, setManualPinMode] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);

  const forgottenRemaining = credits.remaining;
  const pinLocation = pinType === "verified" ? currentLocation : selected;
  const canSubmitPin = Boolean(pinLocation) && photoDecisionMade && (pinType !== "forgotten" || forgottenRemaining > 0);
  const taggedFriends = useMemo(() => friends.filter((friend) => tagged.includes(friend.id)), [friends, tagged]);

  function requestMapStartLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function refresh() {
    const meData = await api<{ user: User | null }>("/api/me");
    if (!meData.user) {
      setMe(null);
      setPinTagRequests([]);
      return;
    }
    const [friendsData, pinsData, statsData, creditsData, pinTagsData] = await Promise.all([
      api<{ friends: Friend[]; incomingRequests: FriendRequest[] }>("/api/friends"),
      api<{ pins: Pin[] }>("/api/pins"),
      api<Stats>("/api/stats"),
      api<CreditBalance>("/api/credits"),
      api<{ requests: PinTagRequest[] }>("/api/pin-tags"),
    ]);
    setMe(meData.user);
    setFriends(friendsData.friends);
    setRequests(friendsData.incomingRequests);
    setPins(pinsData.pins);
    setStats(statsData);
    setCredits(creditsData);
    setPinTagRequests(pinTagsData.requests);
    if (!currentLocation) requestMapStartLocation();
  }

  useEffect(() => {
    void Promise.resolve()
      .then(refresh)
      .catch(() => undefined)
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (pinType !== "forgotten") return;
    const query = placeSearchQuery.trim();
    if (query.length < 2) return;
    const timeout = window.setTimeout(() => {
      void searchPlaces(query, { silent: true });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [placeSearchQuery, pinType, currentLocation]);

  async function requestCurrentLocation() {
    setMessage("");
    if (!navigator.geolocation) {
      setMessage("This browser does not support location.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setCurrentLocation(point);
        setSelected(point);
        setMessage("Current location locked for a GPS-verified pin.");
        setBusy(false);
      },
      () => {
        setMessage("Allow location permission to create a GPS-verified pin.");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function resetPinDraft(nextPinType?: "verified" | "forgotten") {
    if (nextPinType) setPinType(nextPinType);
    setPhotoDecisionMade(false);
    setPhotoDataUrl(null);
    setPlaceSearchMessage("");
    setManualPinMode(false);
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const data = await api<{ user: User }>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setMe(data.user);
      setUsername("");
      setPassword("");
      await refresh();
      setMessage(mode === "signup" ? "Account created. Time to mark territory." : "Welcome back.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not authenticate");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setMe(null);
    setPins([]);
    setFriends([]);
    setRequests([]);
    setPinTagRequests([]);
  }

  async function addFriend(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/friends/request", { method: "POST", body: JSON.stringify({ username: friendUsername }) });
      setFriendUsername("");
      await refresh();
      setMessage("Friend request sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send friend request");
    } finally {
      setBusy(false);
    }
  }

  async function respond(requestId: string, action: "accept" | "reject") {
    await api("/api/friends/respond", { method: "POST", body: JSON.stringify({ requestId, action }) });
    await refresh();
  }

  async function respondPinTag(requestId: string, action: "accept" | "reject") {
    setBusy(true);
    setMessage("");
    try {
      await api("/api/pin-tags/respond", { method: "POST", body: JSON.stringify({ requestId, action }) });
      await refresh();
      setMessage(action === "accept" ? "Pin tag accepted. It is now on your map." : "Pin tag rejected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not respond to pin tag");
    } finally {
      setBusy(false);
    }
  }

  async function submitPin(event: FormEvent) {
    event.preventDefault();
    const location = pinType === "verified" ? currentLocation : selected;
    if (!location) {
      if (pinType === "verified") await requestCurrentLocation();
      return;
    }
    if (!photoDecisionMade) {
      setMessage(pinType === "verified" ? "Take a camera photo or continue without one." : "Attach a photo or continue without one.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api("/api/pins", {
        method: "POST",
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
          placeLabel: placeLabel.trim() || null,
          pinType,
          activityType,
          activityOtherLabel: activityOtherLabel.trim() || null,
          currentLatitude: pinType === "verified" ? location.latitude : currentLocation?.latitude,
          currentLongitude: pinType === "verified" ? location.longitude : currentLocation?.longitude,
          participantIds: tagged,
          photoDataUrl,
        }),
      });
      setSelected(null);
      setPlaceLabel("");
      setPlaceSearchQuery("");
      setPlaceSearchResults([]);
      setPlaceSearchMessage("");
      setManualPinMode(false);
      setActivityType("hangout");
      setActivityOtherLabel("");
      setTagged([]);
      setPhotoDataUrl(null);
      setPhotoDecisionMade(false);
      await refresh();
      setMessage(tagged.length ? "Pin dropped. Tags sent for friend approval." : "Pin dropped. Bragging rights updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create pin");
    } finally {
      setBusy(false);
    }
  }

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      setPhotoDataUrl(await fileToDataUrl(file));
      setPhotoDecisionMade(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not attach photo");
    } finally {
      setBusy(false);
    }
  }

  async function handleProfilePhoto(file: File | undefined) {
    if (!file || !me) return;
    setBusy(true);
    try {
      const photoDataUrl = await fileToDataUrl(file);
      const data = await api<{ profilePhotoUrl: string | null }>("/api/profile/photo", {
        method: "POST",
        body: JSON.stringify({ photoDataUrl }),
      });
      setMe({ ...me, profilePhotoUrl: data.profilePhotoUrl });
      await refresh();
      setMessage("Profile photo updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update profile photo");
    } finally {
      setBusy(false);
    }
  }

  async function loadRazorpay() {
    if (window.Razorpay) return;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load Razorpay checkout"));
      document.body.appendChild(script);
    });
  }

  async function buyCredits() {
    setBusy(true);
    setMessage("");
    setPaymentMessage("Starting Razorpay checkout...");
    try {
      await loadRazorpay();
      const order = await api<{ orderId: string; amount: number; currency: string; keyId: string }>("/api/payments/razorpay/order", { method: "POST" });
      if (!window.Razorpay) throw new Error("Razorpay checkout could not load. Please try again.");
      if (!order.keyId) throw new Error("Razorpay key is missing in Vercel environment variables.");
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Fun Map",
        description: "10 forgotten pin credits",
        order_id: order.orderId,
        handler: async (response) => {
          setPaymentMessage("Verifying payment...");
          await api("/api/payments/razorpay/verify", { method: "POST", body: JSON.stringify(response) });
          await refresh();
          setPaymentMessage("Payment verified. 10 forgotten pins added.");
        },
        theme: { color: "#047857" },
      });
      checkout.open();
    } catch (error) {
      setPaymentMessage(error instanceof Error ? error.message : "Could not start payment");
    } finally {
      setBusy(false);
    }
  }

  async function searchPlaces(queryOverride?: string, options?: { silent?: boolean }) {
    const query = (queryOverride ?? placeSearchQuery).trim();
    if (!query) {
      setPlaceSearchMessage("Type a place name first.");
      return;
    }
    const key = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
    if (!key) {
      setPlaceSearchMessage("Map search is not configured.");
      return;
    }
    setPlaceSearchLoading(true);
    if (!options?.silent) setBusy(true);
    setPlaceSearchMessage(options?.silent ? "Finding nearby matches..." : "Searching places...");
    try {
      const params = new URLSearchParams({
        key,
        limit: "10",
        autocomplete: "true",
        fuzzyMatch: "true",
        country: "in",
        language: "en,hi",
        types: placeSearchTypes,
      });
      if (currentLocation) {
        params.set("proximity", `${currentLocation.longitude},${currentLocation.latitude}`);
      } else {
        params.set("proximity", "ip");
      }
      const res = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?${params.toString()}`);
      const text = await res.text();
      let data: { error?: string; features?: { id: string; place_name?: string; text?: string; center?: [number, number] }[] } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        if (!res.ok) throw new Error(text || "Place search failed");
        throw new Error("Place search returned an unexpected response");
      }
      if (!res.ok) throw new Error(data.error ?? text ?? "Place search failed");
      const results = ((data.features ?? []) as { id: string; place_name?: string; text?: string; center?: [number, number] }[])
        .filter((feature) => Array.isArray(feature.center) && feature.center.length >= 2)
        .map((feature) => ({
          id: feature.id,
          label: feature.place_name ?? feature.text ?? query,
          longitude: feature.center?.[0] ?? 0,
          latitude: feature.center?.[1] ?? 0,
        }));
      setPlaceSearchResults(results);
      setPlaceSearchMessage(results.length ? "Choose a nearby suggestion." : "No places found. Try manual pinning.");
    } catch (error) {
      setPlaceSearchMessage(placeSearchErrorMessage(error));
    } finally {
      setPlaceSearchLoading(false);
      if (!options?.silent) setBusy(false);
    }
  }

  function choosePlace(result: PlaceSearchResult) {
    setSelected({ latitude: result.latitude, longitude: result.longitude });
    setPlaceLabel(result.label);
    setPlaceSearchQuery(result.label);
    setPlaceSearchResults([]);
    setPlaceSearchMessage("Place selected from search.");
    setManualPinMode(false);
    setPhotoDecisionMade(false);
  }

  function selectManualPoint(point: SelectedPoint) {
    if (pinType !== "forgotten" || !manualPinMode) return;
    setSelected(point);
    setPlaceLabel("Manual spot");
    setPlaceSearchMessage("Manual map spot selected.");
    setPhotoDecisionMade(false);
  }

  function avatar(user: { username: string; profilePhotoUrl?: string | null }, size = "h-9 w-9") {
    return user.profilePhotoUrl ? (
      <img src={user.profilePhotoUrl} alt={`@${user.username}`} className={clsx(size, "rounded-full object-cover")} />
    ) : (
      <span className={clsx(size, "grid place-items-center rounded-full bg-emerald-700 text-sm font-black uppercase text-white")}>{user.username.charAt(0)}</span>
    );
  }

  if (!authChecked) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f2ea] px-5 text-slate-950">
        <section className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">Fun Map</p>
          <h1 className="mt-3 text-2xl font-black">Checking your session...</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">If this device has been used in the last 3 days, we will take you straight to your map.</p>
        </section>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="min-h-screen bg-[#f5f2ea] px-5 py-8 text-slate-950">
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">Fun Map</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight">Mark the places your crew has conquered.</h1>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Add friends, drop map pins, attach proof, and keep forgotten pins limited so the claims still mean something.
            </p>
          </div>
          <form onSubmit={submitAuth} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-2 rounded-md bg-slate-100 p-1 text-sm font-semibold">
              <button type="button" onClick={() => setMode("signup")} className={clsx("rounded px-3 py-2", mode === "signup" && "bg-white shadow")}>Sign up</button>
              <button type="button" onClick={() => setMode("login")} className={clsx("rounded px-3 py-2", mode === "login" && "bg-white shadow")}>Log in</button>
            </div>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="unique username" className="w-full rounded-md border border-slate-300 px-4 py-3 text-base outline-none focus:border-emerald-600" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" className="w-full rounded-md border border-slate-300 px-4 py-3 text-base outline-none focus:border-emerald-600" />
            <button disabled={busy} className="w-full rounded-md bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-60">
              {busy ? "Working..." : mode === "signup" ? "Create account" : "Enter map"}
            </button>
            {message && <p className="text-sm text-slate-600">{message}</p>}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f3ec] text-slate-950">
      <header className="sticky top-0 z-[2000] border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Fun Map</p>
            <div className="relative mt-1 flex items-center gap-2">
              <button type="button" onClick={() => setShowProfileUploadPrompt((value) => !value)} className="rounded-full outline-none focus:ring-2 focus:ring-emerald-700" title="Profile photo options">
                {avatar(me)}
              </button>
              <input ref={profilePhotoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleProfilePhoto(e.target.files?.[0])} />
              {showProfileUploadPrompt && (
                <div className="absolute left-0 top-12 z-[2200] w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                  <p className="text-xs font-semibold text-slate-500">Profile picture</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileUploadPrompt(false);
                      profilePhotoInputRef.current?.click();
                    }}
                    className="mt-2 w-full rounded-md bg-emerald-700 px-3 py-2 text-left text-sm font-bold text-white"
                  >
                    Upload profile photo
                  </button>
                  <button type="button" onClick={() => setShowProfileUploadPrompt(false)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-left text-sm font-semibold">
                    Cancel
                  </button>
                </div>
              )}
              <h1 className="text-lg font-black">@{me.username}</h1>
            </div>
          </div>
          <button onClick={logout} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold">
            <LogOut size={16} /> Log out
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[1fr_360px]">
        <section className="h-[58vh] min-h-[420px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:h-[calc(100vh-7rem)]">
          <DrinkMap pins={pins} selected={pinType === "forgotten" ? selected : null} currentLocation={currentLocation} onSelect={selectManualPoint} mapTilerKey={process.env.NEXT_PUBLIC_MAPTILER_API_KEY ?? ""} />
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-black"><MapPin size={18} /> Drop a pin</h2>
            <form onSubmit={submitPin} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => resetPinDraft("verified")} className={clsx("rounded-md border px-3 py-2 text-sm font-bold", pinType === "verified" ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-slate-300")}>GPS verified</button>
                <button type="button" onClick={() => resetPinDraft("forgotten")} className={clsx("rounded-md border px-3 py-2 text-sm font-bold", pinType === "forgotten" ? "border-amber-600 bg-amber-50 text-amber-800" : "border-slate-300")}>Forgotten</button>
              </div>
              <p className="text-xs text-slate-500">
                {pinType === "forgotten" ? `${forgottenRemaining} forgotten pins left this month. Buy 10 more for Rs 10.` : "GPS verified pins use your current browser location directly."}
              </p>
              {pinType === "verified" && (
                <button type="button" onClick={requestCurrentLocation} disabled={busy} className="w-full rounded-md border border-emerald-700 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-60">
                  {currentLocation ? "Refresh current location" : "Use my current location"}
                </button>
              )}
              {pinType === "forgotten" && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-600">Search is the easiest way to place a forgotten pin.</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={placeSearchQuery}
                      onChange={(e) => {
                        const value = e.target.value;
                        setPlaceSearchQuery(value);
                        if (value.trim().length < 2) {
                          setPlaceSearchResults([]);
                          setPlaceSearchMessage(value.trim() ? "Type at least 2 characters for suggestions." : "");
                        }
                      }}
                      placeholder="Search park, cafe, area..."
                      className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button type="button" onClick={() => searchPlaces()} disabled={busy || placeSearchLoading} className="rounded-md bg-slate-950 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">Search</button>
                  </div>
                  {placeSearchResults.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {placeSearchResults.map((result) => (
                        <button key={result.id} type="button" onClick={() => choosePlace(result)} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700">
                          {result.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {placeSearchMessage && <p className="mt-2 text-xs font-semibold text-slate-500">{placeSearchLoading ? "Searching nearby places..." : placeSearchMessage}</p>}
                  <button
                    type="button"
                    onClick={() => {
                      setManualPinMode((value) => !value);
                      setPlaceSearchMessage(manualPinMode ? "Search for a place or enable manual pinning." : "Manual mode enabled. Tap the map to choose a spot.");
                    }}
                    className={clsx("mt-3 w-full rounded-md border px-3 py-2 text-sm font-bold", manualPinMode ? "border-amber-600 bg-amber-50 text-amber-800" : "border-slate-300 bg-white text-slate-700")}
                  >
                    {manualPinMode ? "Manual pin active: tap the map" : "Use manual map pin instead"}
                  </button>
                </div>
              )}
              <input value={placeLabel} onChange={(e) => setPlaceLabel(e.target.value)} placeholder="Place label, optional" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                {activities.map((activity) => (
                  <button
                    type="button"
                    key={activity.value}
                    onClick={() => setActivityType(activity.value)}
                    className={clsx("rounded-md border px-3 py-2 text-xs font-bold", activityType === activity.value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300")}
                  >
                    <span className="mr-1">{activity.icon}</span>{activity.label}
                  </button>
                ))}
              </div>
              {activityType === "other" && (
                <input value={activityOtherLabel} onChange={(e) => setActivityOtherLabel(e.target.value)} placeholder="Other activity label" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              )}
              <div className="flex flex-wrap gap-2">
                {friends.map((friend) => (
                  <button
                    type="button"
                    key={friend.id}
                    onClick={() => setTagged((ids) => ids.includes(friend.id) ? ids.filter((id) => id !== friend.id) : [...ids, friend.id])}
                    className={clsx("rounded-full border px-3 py-1 text-xs font-bold", tagged.includes(friend.id) ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300")}
                  >
                    @{friend.username}
                  </button>
                ))}
              </div>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-3 text-sm font-semibold text-slate-600">
                <Camera size={18} /> {photoDataUrl ? "Replace photo" : pinType === "verified" ? "Take photo" : "Attach photo"}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhoto(e.target.files?.[0])} />
              </label>
              {pinLocation && !photoDecisionMade && (
                <button type="button" onClick={() => setPhotoDecisionMade(true)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">
                  Continue without pic
                </button>
              )}
              {photoDataUrl && (
                <div className="relative overflow-hidden rounded-md">
                  <img src={photoDataUrl} alt="Pin preview" className="h-36 w-full object-cover" />
                  <button type="button" onClick={() => setPhotoDataUrl(null)} className="absolute right-2 top-2 rounded-full bg-white p-1 shadow"><X size={16} /></button>
                </div>
              )}
              <button disabled={busy || !canSubmitPin} className="w-full rounded-md bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-50">
                {pinType === "verified" ? (currentLocation ? "Create GPS pin here" : "Allow location first") : selected ? "Create forgotten pin" : "Search for a place first"}
              </button>
              {pinType === "forgotten" && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900">
                    {forgottenRemaining > 0 ? "Want a bigger buffer? You can buy credits before your free pins end." : "No forgotten pins left. Buy credits to continue."}
                  </p>
                  <button type="button" onClick={buyCredits} disabled={busy} className="mt-2 w-full rounded-md bg-amber-500 px-4 py-3 font-black text-slate-950 disabled:opacity-60">
                    {busy ? "Working..." : "Buy 10 forgotten pins for Rs 10"}
                  </button>
                  {paymentMessage && <p className="mt-2 text-xs font-semibold text-amber-900">{paymentMessage}</p>}
                </div>
              )}
            </form>
          </section>

          <section className="grid grid-cols-2 gap-2">
            {[
              ["Pins", stats.totalPins],
              ["Places", stats.uniquePlaces],
              ["With friends", stats.friendTaggedPins],
              ["Forgotten left", credits.remaining],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-black">{value}</p>
              </div>
            ))}
          </section>

          {pinTagRequests.length > 0 && (
            <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <h2 className="flex items-center gap-2 text-base font-black"><Check size={18} /> Pin approvals</h2>
              <div className="mt-3 space-y-3">
                {pinTagRequests.map((request) => (
                  <div key={request.id} className="rounded-md border border-amber-200 bg-white p-3">
                    {request.photoUrl && <img src={request.photoUrl} alt="Pin proof" className="mb-2 h-24 w-full rounded object-cover" />}
                    <p className="text-sm font-black">{request.placeLabel || "Unnamed spot"}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      @{request.creatorUsername} tagged you in a {request.pinType} {activityDisplay(request.activityType, request.activityOtherLabel)} pin.
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" disabled={busy} onClick={() => respondPinTag(request.id, "accept")} className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-60">
                        Accept
                      </button>
                      <button type="button" disabled={busy} onClick={() => respondPinTag(request.id, "reject")} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold disabled:opacity-60">
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-black"><UserPlus size={18} /> Friends</h2>
            <form onSubmit={addFriend} className="mt-3 flex gap-2">
              <input value={friendUsername} onChange={(e) => setFriendUsername(e.target.value)} placeholder="username" className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <button disabled={busy} className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-bold text-white"><Plus size={16} /></button>
            </form>
            <div className="mt-4 space-y-2">
              {requests.map((request) => (
                <div key={request.id} className="flex items-center justify-between rounded-md bg-amber-50 px-3 py-2 text-sm">
                  <span>@{request.username}</span>
                  <span className="flex gap-2">
                    <button onClick={() => respond(request.id, "accept")} className="rounded bg-emerald-700 p-1 text-white"><Check size={14} /></button>
                    <button onClick={() => respond(request.id, "reject")} className="rounded bg-slate-200 p-1"><X size={14} /></button>
                  </span>
                </div>
              ))}
              {friends.map((friend) => <p key={friend.id} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold">{avatar(friend, "h-7 w-7")} @{friend.username}</p>)}
              {!friends.length && !requests.length && <p className="text-sm text-slate-500">No friends yet. Add one by username.</p>}
            </div>
          </section>

          {taggedFriends.length > 0 && <p className="text-sm text-slate-500">Tagging {taggedFriends.map((f) => `@${f.username}`).join(", ")}</p>}
          {message && <p className="rounded-md bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">{message}</p>}
        </aside>
      </div>
    </main>
  );
}

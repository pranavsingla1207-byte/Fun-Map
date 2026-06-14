"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useState } from "react";
import imageCompression from "browser-image-compression";
import { Camera, Check, LogOut, MapPin, Plus, UserPlus, X } from "lucide-react";
import { clsx } from "clsx";

const DrinkMap = dynamic(() => import("@/components/drink-map"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading map...</div>,
});

type User = { id: string; username: string };
type Friend = { id: string; username: string };
type FriendRequest = { id: string; username: string; createdAt: string };
type Stats = { totalPins: number; uniquePlaces: number; friendTaggedPins: number; forgottenPinsUsedThisWeek: number };
type Pin = {
  id: string;
  creatorId: string;
  creatorUsername: string;
  latitude: number;
  longitude: number;
  placeLabel: string | null;
  pinType: "verified" | "forgotten";
  createdAt: string;
  participants: Friend[];
  photoUrl: string | null;
};
type SelectedPoint = { latitude: number; longitude: number };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data as T;
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
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [pins, setPins] = useState<Pin[]>([]);
  const [stats, setStats] = useState<Stats>({ totalPins: 0, uniquePlaces: 0, friendTaggedPins: 0, forgottenPinsUsedThisWeek: 0 });
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<SelectedPoint | null>(null);
  const [currentLocation, setCurrentLocation] = useState<SelectedPoint | null>(null);
  const [friendUsername, setFriendUsername] = useState("");
  const [pinType, setPinType] = useState<"verified" | "forgotten">("verified");
  const [placeLabel, setPlaceLabel] = useState("");
  const [tagged, setTagged] = useState<string[]>([]);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const forgottenRemaining = Math.max(0, 2 - stats.forgottenPinsUsedThisWeek);
  const pinLocation = pinType === "verified" ? currentLocation : selected;
  const canSubmitPin = Boolean(pinLocation);
  const taggedFriends = useMemo(() => friends.filter((friend) => tagged.includes(friend.id)), [friends, tagged]);

  async function refresh() {
    const meData = await api<{ user: User | null }>("/api/me");
    if (!meData.user) {
      setMe(null);
      return;
    }
    const [friendsData, pinsData, statsData] = await Promise.all([
      api<{ friends: Friend[]; incomingRequests: FriendRequest[] }>("/api/friends"),
      api<{ pins: Pin[] }>("/api/pins"),
      api<Stats>("/api/stats"),
    ]);
    setMe(meData.user);
    setFriends(friendsData.friends);
    setRequests(friendsData.incomingRequests);
    setPins(pinsData.pins);
    setStats(statsData);
  }

  useEffect(() => {
    void Promise.resolve().then(refresh).catch(() => undefined);
  }, []);

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

  async function submitPin(event: FormEvent) {
    event.preventDefault();
    const location = pinType === "verified" ? currentLocation : selected;
    if (!location) {
      if (pinType === "verified") await requestCurrentLocation();
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
          currentLatitude: pinType === "verified" ? location.latitude : currentLocation?.latitude,
          currentLongitude: pinType === "verified" ? location.longitude : currentLocation?.longitude,
          participantIds: tagged,
          photoDataUrl,
        }),
      });
      setSelected(null);
      setPlaceLabel("");
      setTagged([]);
      setPhotoDataUrl(null);
      await refresh();
      setMessage("Pin dropped. Bragging rights updated.");
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not attach photo");
    } finally {
      setBusy(false);
    }
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
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Fun Map</p>
            <h1 className="text-lg font-black">@{me.username}</h1>
          </div>
          <button onClick={logout} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold">
            <LogOut size={16} /> Log out
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[1fr_360px]">
        <section className="h-[58vh] min-h-[420px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:h-[calc(100vh-7rem)]">
          <DrinkMap pins={pins} selected={pinType === "forgotten" ? selected : null} currentLocation={currentLocation} onSelect={setSelected} mapTilerKey={process.env.NEXT_PUBLIC_MAPTILER_API_KEY ?? ""} />
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-black"><MapPin size={18} /> Drop a pin</h2>
            <form onSubmit={submitPin} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPinType("verified")} className={clsx("rounded-md border px-3 py-2 text-sm font-bold", pinType === "verified" ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-slate-300")}>GPS verified</button>
                <button type="button" onClick={() => setPinType("forgotten")} className={clsx("rounded-md border px-3 py-2 text-sm font-bold", pinType === "forgotten" ? "border-amber-600 bg-amber-50 text-amber-800" : "border-slate-300")}>Forgotten</button>
              </div>
              <p className="text-xs text-slate-500">
                {pinType === "forgotten" ? `${forgottenRemaining} forgotten pins left this week. Extra pins will be Rs 10 later.` : "GPS verified pins use your current browser location directly."}
              </p>
              {pinType === "verified" && (
                <button type="button" onClick={requestCurrentLocation} disabled={busy} className="w-full rounded-md border border-emerald-700 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-60">
                  {currentLocation ? "Refresh current location" : "Use my current location"}
                </button>
              )}
              <input value={placeLabel} onChange={(e) => setPlaceLabel(e.target.value)} placeholder="Place label, optional" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
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
                <Camera size={18} /> {photoDataUrl ? "Replace photo" : "Attach photo"}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhoto(e.target.files?.[0])} />
              </label>
              {photoDataUrl && (
                <div className="relative overflow-hidden rounded-md">
                  <img src={photoDataUrl} alt="Pin preview" className="h-36 w-full object-cover" />
                  <button type="button" onClick={() => setPhotoDataUrl(null)} className="absolute right-2 top-2 rounded-full bg-white p-1 shadow"><X size={16} /></button>
                </div>
              )}
              <button disabled={busy || !canSubmitPin} className="w-full rounded-md bg-slate-950 px-4 py-3 font-bold text-white disabled:opacity-50">
                {pinType === "verified" ? (currentLocation ? "Create GPS pin here" : "Allow location first") : selected ? "Create forgotten pin" : "Tap map to choose forgotten spot"}
              </button>
            </form>
          </section>

          <section className="grid grid-cols-2 gap-2">
            {[
              ["Pins", stats.totalPins],
              ["Places", stats.uniquePlaces],
              ["With friends", stats.friendTaggedPins],
              ["Forgotten used", `${stats.forgottenPinsUsedThisWeek}/2`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-black">{value}</p>
              </div>
            ))}
          </section>

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
              {friends.map((friend) => <p key={friend.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold">@{friend.username}</p>)}
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

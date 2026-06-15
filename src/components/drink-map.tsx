"use client";

import { DivIcon, Icon, LatLngExpression } from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";

type Friend = { id: string; username: string; profilePhotoUrl?: string | null };
type Pin = {
  id: string;
  creatorUsername: string;
  creatorProfilePhotoUrl: string | null;
  creatorIsParticipant: boolean;
  latitude: number;
  longitude: number;
  placeLabel: string | null;
  pinType: "verified" | "forgotten";
  activityType: "hangout" | "party" | "random_drive" | "bunking" | "other";
  activityOtherLabel: string | null;
  createdAt: string;
  participants: Friend[];
  pendingParticipants?: Friend[];
  canRemoveSelf?: boolean;
  photoUrl: string | null;
};
type Point = { latitude: number; longitude: number };

const defaultIcon = new Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const markerColors = ["#047857", "#2563eb", "#c2410c", "#7c3aed", "#be123c", "#0f766e", "#a16207"];
const activityMeta = {
  hangout: { label: "Hangout", icon: "H" },
  party: { label: "Party", icon: "P" },
  random_drive: { label: "Random Drive", icon: "D" },
  bunking: { label: "Bunking", icon: "B" },
  other: { label: "Other", icon: "*" },
};

function colorForUsername(username: string) {
  const sum = username.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return markerColors[sum % markerColors.length];
}

function avatarBubbleHtml(user: { username: string; profilePhotoUrl?: string | null }, index: number) {
  const color = colorForUsername(user.username);
  const initial = user.username.charAt(0).toUpperCase() || "?";
  const content = user.profilePhotoUrl
    ? `<img src="${user.profilePhotoUrl}" alt="" style="width:100%;height:100%;border-radius:999px;object-fit:cover;" />`
    : initial;
  return `<div style="position:absolute;left:${index * 18}px;top:0;width:30px;height:30px;border-radius:999px;display:grid;place-items:center;background:${color};color:white;border:3px solid white;box-shadow:0 8px 18px rgba(15,23,42,.25);font:800 13px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden;">${content}</div>`;
}

function initialIcon(pin: Pin) {
  const activity = activityMeta[pin.activityType] ?? activityMeta.hangout;
  const activeUsers = [...(pin.creatorIsParticipant ? [{ username: pin.creatorUsername, profilePhotoUrl: pin.creatorProfilePhotoUrl }] : []), ...pin.participants];
  const clusterUsers = activeUsers.slice(0, 4);
  const overflowCount = Math.max(0, activeUsers.length - clusterUsers.length);
  const clusterWidth = Math.max(40, clusterUsers.length * 18 + 12 + (overflowCount ? 18 : 0));
  const avatarsHtml = clusterUsers.map((person, index) => avatarBubbleHtml(person, index)).join("");
  const overflowHtml = overflowCount
    ? `<div style="position:absolute;left:${clusterUsers.length * 18}px;top:2px;width:26px;height:26px;border-radius:999px;display:grid;place-items:center;background:#111827;color:white;border:2px solid white;box-shadow:0 8px 18px rgba(15,23,42,.25);font:900 10px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">+${overflowCount}</div>`
    : "";
  return new DivIcon({
    className: "",
    html: `<div style="position:relative;width:${clusterWidth}px;height:42px;">
      ${avatarsHtml}${overflowHtml}
      <div style="position:absolute;left:${Math.max(18, clusterWidth - 22)}px;top:20px;width:18px;height:18px;border-radius:999px;display:grid;place-items:center;background:#f59e0b;color:#111827;border:2px solid white;font:900 10px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${activity.icon}</div>
    </div>`,
    iconSize: [clusterWidth, 42],
    iconAnchor: [Math.min(24, clusterWidth / 2), 18],
  });
}

function Picker({ onSelect }: { onSelect: (point: Point) => void }) {
  useMapEvents({
    click(event) {
      onSelect({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

function RecenterMap({ currentLocation, fallbackPin }: { currentLocation: Point | null; fallbackPin: Pin | undefined }) {
  const map = useMap();

  useEffect(() => {
    if (currentLocation) {
      map.setView([currentLocation.latitude, currentLocation.longitude], Math.max(map.getZoom(), 14));
      return;
    }
    if (fallbackPin) {
      map.setView([fallbackPin.latitude, fallbackPin.longitude], map.getZoom());
    }
  }, [currentLocation, fallbackPin, map]);

  return null;
}

export default function DrinkMap({
  pins,
  selected,
  currentLocation,
  onSelect,
  onRemovePin,
  mapTilerKey,
}: {
  pins: Pin[];
  selected: Point | null;
  currentLocation: Point | null;
  onSelect: (point: Point) => void;
  onRemovePin: (pinId: string) => void;
  mapTilerKey: string;
}) {
  const center: LatLngExpression = currentLocation
    ? [currentLocation.latitude, currentLocation.longitude]
    : pins[0]
      ? [pins[0].latitude, pins[0].longitude]
      : [28.6139, 77.209];
  const tileUrl = mapTilerKey
    ? `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${mapTilerKey}`
    : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

  return (
    <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom>
      <TileLayer attribution='&copy; OpenStreetMap contributors &copy; MapTiler' url={tileUrl} />
      <RecenterMap currentLocation={currentLocation} fallbackPin={pins[0]} />
      <Picker onSelect={onSelect} />
      {currentLocation && (
        <Marker position={[currentLocation.latitude, currentLocation.longitude]} icon={defaultIcon}>
          <Popup>Your current location</Popup>
        </Marker>
      )}
      {selected && (
        <Marker position={[selected.latitude, selected.longitude]} icon={defaultIcon}>
          <Popup>Selected pin spot</Popup>
        </Marker>
      )}
      {pins.map((pin) => (
        <Marker key={pin.id} position={[pin.latitude, pin.longitude]} icon={initialIcon(pin)}>
          <Popup>
            <div className="w-48">
              {pin.photoUrl && <img src={pin.photoUrl} alt="Pin proof" className="mb-2 h-28 w-full rounded object-cover" />}
              <p className="font-bold">{pin.placeLabel || "Unnamed spot"}</p>
              <p className="text-xs text-slate-600">By @{pin.creatorUsername} - {pin.pinType}</p>
              <p className="mt-1 text-xs font-bold text-amber-700">
                {activityMeta[pin.activityType]?.label ?? "Hangout"}{pin.activityType === "other" && pin.activityOtherLabel ? `: ${pin.activityOtherLabel}` : ""}
              </p>
              {pin.participants.length > 0 && <p className="mt-1 text-xs">With {pin.participants.map((p) => `@${p.username}`).join(", ")}</p>}
              {(pin.pendingParticipants?.length ?? 0) > 0 && <p className="mt-1 text-xs text-amber-700">Pending {pin.pendingParticipants?.map((p) => `@${p.username}`).join(", ")}</p>}
              {pin.canRemoveSelf && (
                <button type="button" onClick={() => onRemovePin(pin.id)} className="mt-2 w-full rounded bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
                  Remove my bubble
                </button>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

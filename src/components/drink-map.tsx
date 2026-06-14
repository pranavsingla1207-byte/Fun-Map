"use client";

import { DivIcon, Icon, LatLngExpression } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from "react-leaflet";

type Friend = { id: string; username: string };
type Pin = {
  id: string;
  creatorUsername: string;
  latitude: number;
  longitude: number;
  placeLabel: string | null;
  pinType: "verified" | "forgotten";
  createdAt: string;
  participants: Friend[];
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

function colorForUsername(username: string) {
  const sum = username.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return markerColors[sum % markerColors.length];
}

function initialIcon(username: string) {
  const initial = username.charAt(0).toUpperCase() || "?";
  const color = colorForUsername(username);
  return new DivIcon({
    className: "",
    html: `<div style="width:34px;height:34px;border-radius:999px;display:grid;place-items:center;background:${color};color:white;border:3px solid white;box-shadow:0 8px 18px rgba(15,23,42,.25);font:800 15px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${initial}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
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

export default function DrinkMap({
  pins,
  selected,
  currentLocation,
  onSelect,
  mapTilerKey,
}: {
  pins: Pin[];
  selected: Point | null;
  currentLocation: Point | null;
  onSelect: (point: Point) => void;
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
        <Marker key={pin.id} position={[pin.latitude, pin.longitude]} icon={initialIcon(pin.creatorUsername)}>
          <Popup>
            <div className="w-48">
              {pin.photoUrl && <img src={pin.photoUrl} alt="Pin proof" className="mb-2 h-28 w-full rounded object-cover" />}
              <p className="font-bold">{pin.placeLabel || "Unnamed spot"}</p>
              <p className="text-xs text-slate-600">By @{pin.creatorUsername} - {pin.pinType}</p>
              {pin.participants.length > 0 && <p className="mt-1 text-xs">With {pin.participants.map((p) => `@${p.username}`).join(", ")}</p>}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

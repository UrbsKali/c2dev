import type { DivIcon, Map as LeafletMap, Marker } from 'leaflet';
import type { Robot } from '$types';
import ms from 'milsymbol';
import type { Symbol as MilSymbol } from 'milsymbol';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png?url';
import iconUrl from 'leaflet/dist/images/marker-icon.png?url';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png?url';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const roleToSidc: Record<Robot['type'], string> = {
  INF: 'SFGPUCI----*****',
  ARM: 'SFGPUCA----*****',
  ENG: 'SFGPUCE----*****',
  UAV: 'SFAPMFQ----*****',
  UUV: 'SFNPUUS----*****',
  SPT: 'SFGPUCS----*****',
  OTHER: 'SFGPUC-----*****'
};

const iconCache = new Map<string, DivIcon>();
let leafletConfigured = false;

export function configureLeaflet(L: typeof import('leaflet')): void {
  if (leafletConfigured) return;
  (L.Icon.Default as unknown as { imagePath?: string }).imagePath = '';
  L.Icon.Default.mergeOptions({
    iconRetinaUrl,
    iconUrl,
    shadowUrl
  });
  leafletConfigured = true;
}

function buildSymbol(robot: Robot): MilSymbol {
  const sidc = roleToSidc[robot.type] ?? roleToSidc.OTHER;
  return new ms.Symbol(sidc, {
    size: 16,
    // uniqueDesignation: robot.name ?? robot.id
  });
}

function toDivIcon(L: typeof import('leaflet'), robot: Robot): DivIcon {
  const cacheKey = `${robot.type}-${robot.name ?? robot.id}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const symbol = buildSymbol(robot);
  const svg = symbol.asSVG();
  const icon = L.divIcon({
    html: svg,
    className: 'robot-symbol',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
  iconCache.set(cacheKey, icon);
  return icon;
}

export function renderRobotMarker(L: typeof import('leaflet'), robot: Robot): Marker | null {
  if (!robot.position) return null;
  const icon = toDivIcon(L, robot);
  const marker = L.marker([robot.position.lat, robot.position.lon], {
    icon
  });
  const status = robot.status ?? 'Unknown status';
  marker.bindPopup(`<strong>${robot.name ?? robot.id}</strong><br/>Status: ${status}`);
  return marker;
}

export function initializeMap(L: typeof import('leaflet'), container: HTMLElement): LeafletMap {
  const map = L.map(container, {
    zoomControl: true,
    center: [0, 0],
    zoom: 2,
    worldCopyJump: true
  });

  L.tileLayer(TILE_URL, {
    maxZoom: 20,
    attribution: ATTRIBUTION
  }).addTo(map);

  return map;
}

<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { onDestroy, onMount } from 'svelte';
  import type {
    FeatureGroup as LeafletFeatureGroup,
    Layer as LeafletLayer,
    LayerGroup as LeafletLayerGroup,
    Map as LeafletMap,
    Marker as LeafletMarker,
    Polyline as LeafletPolyline
  } from 'leaflet';
  import type { Robot } from '$types';
  import { robots, selectedRobotId } from '$stores/robots';
  import { socketState } from '$services/websocket';

  const dispatch = createEventDispatcher<{
    waypointCreated: { robotId: string | null; coordinates: [number, number][] };
  }>();

  let container: HTMLDivElement | null = null;
  let map: LeafletMap | null = null;
  let markerLayer: LeafletLayerGroup | null = null;
  let trailLayer: LeafletLayerGroup | null = null;
  let drawnItems: LeafletFeatureGroup | null = null;
  let drawControl: import('leaflet').Control.Draw | null = null;
  let leaflet: typeof import('leaflet') | null = null;
  let mapHelpers: typeof import('$services/map') | null = null;

  let selectedRobotIdValue: string | null = null;

  let unsubscribeRobots: (() => void) | null = null;
  let unsubscribeSelection: (() => void) | null = null;

  const markerCache = new Map<string, LeafletMarker>();
  const trailCache = new Map<string, { shadow: LeafletPolyline; path: LeafletPolyline }>();

  let autoFitInitialized = false;
  const AUTOFIT_MAX_ZOOM = 14;

  function removeTrailGraphics(robotId: string): void {
    if (!trailLayer) return;
    const existing = trailCache.get(robotId);
    if (!existing) return;
    if (trailLayer.hasLayer(existing.shadow)) {
      trailLayer.removeLayer(existing.shadow);
    }
    if (trailLayer.hasLayer(existing.path)) {
      trailLayer.removeLayer(existing.path);
    }
    existing.shadow.remove();
    existing.path.remove();
    trailCache.delete(robotId);
  }

  function updateTrailGraphics(robot: Robot, L: typeof import('leaflet')): void {
    if (!trailLayer) return;
    const points = (robot.trail ?? []).map((point) => [point.lat, point.lon] as [number, number]);

    if (points.length < 2) {
      removeTrailGraphics(robot.id);
      return;
    }

    const existing = trailCache.get(robot.id);
    if (!existing) {
      const shadow = L.polyline(points, {
        color: '#38bdf8',
        weight: 6,
        opacity: 0.18,
        lineCap: 'round',
        lineJoin: 'round'
      });
      const path = L.polyline(points, {
        color: '#38bdf8',
        weight: 2.5,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round'
      });

      shadow.addTo(trailLayer);
      path.addTo(trailLayer);
      trailCache.set(robot.id, { shadow, path });
      return;
    }

    existing.shadow.setLatLngs(points);
    existing.path.setLatLngs(points);

    if (!trailLayer.hasLayer(existing.shadow)) {
      existing.shadow.addTo(trailLayer);
    }
    if (!trailLayer.hasLayer(existing.path)) {
      existing.path.addTo(trailLayer);
    }
  }

  function syncMarkers(robotList: Robot[]): void {
    const helpers = mapHelpers;
    const L = leaflet;
    if (!map || !markerLayer || !helpers || !L || !trailLayer) return;
    const layer = markerLayer;
    const seen = new Set<string>();
    const fitPositions: [number, number][] = [];
    let createdMarker = false;

    robotList.forEach((robot) => {
      if (!robot.position) {
        removeTrailGraphics(robot.id);
        return;
      }
      let marker = markerCache.get(robot.id);
      if (!marker) {
        const newMarker = helpers.renderRobotMarker(L, robot);
        if (!newMarker) return;
        markerCache.set(robot.id, newMarker);
        newMarker.addTo(layer);
        marker = newMarker;
        createdMarker = true;
      }
      marker.setLatLng([robot.position.lat, robot.position.lon]);
      marker.setPopupContent(
        `<strong>${robot.name ?? robot.id}</strong><br/>Status: ${robot.status ?? 'Unknown'}<br/>Speed: ${robot.speed?.toFixed(1) ?? '0.0'} m/s`
      );

      updateTrailGraphics(robot, L);

      fitPositions.push([robot.position.lat, robot.position.lon]);
      seen.add(robot.id);
    });

    for (const [id, marker] of markerCache.entries()) {
      if (!seen.has(id)) {
        if (layer.hasLayer(marker)) {
          layer.removeLayer(marker);
        }
        marker.remove();
        markerCache.delete(id);
      }
    }

    for (const id of Array.from(trailCache.keys())) {
      if (!seen.has(id)) {
        removeTrailGraphics(id);
      }
    }

    if (fitPositions.length > 0 && L) {
      const bounds = L.latLngBounds(fitPositions);
      if (bounds.isValid() && (!autoFitInitialized || createdMarker)) {
        map.fitBounds(bounds.pad(0.25), {
          padding: [32, 32],
          maxZoom: AUTOFIT_MAX_ZOOM
        });
        autoFitInitialized = true;
      }
    }
  }

  function highlightRobot(robotId: string | null): void {
    if (!robotId) return;
    const marker = markerCache.get(robotId);
    marker?.openPopup();
  }

  onMount(async () => {
    if (!container || typeof window === 'undefined') return;

    const [leafModule, helpers] = await Promise.all([
      import('leaflet'),
      import('$services/map')
    ]);

    const L = (leafModule as { default?: typeof import('leaflet') })?.default ?? (leafModule as typeof import('leaflet'));

    leaflet = L;
    mapHelpers = helpers;

    await import('leaflet-draw');

    helpers.configureLeaflet(L);

    map = helpers.initializeMap(L, container);
    trailLayer = L.layerGroup().addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    drawnItems = new L.FeatureGroup().addTo(map);

    drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        polyline: {
          shapeOptions: {
            color: '#3BAFDA',
            weight: 3
          }
        },
        marker: {
          icon: new L.Icon.Default()
        }
      },
      edit: {
        featureGroup: drawnItems
      }
    });

    map.addControl(drawControl);

    type CreatedEvent = import('leaflet').LeafletEvent & { layer: LeafletLayer };

    map.on(L.Draw.Event.CREATED, (event: CreatedEvent) => {
      if (!drawnItems) return;
      drawnItems.addLayer(event.layer);
      const coords: [number, number][] = [];
      const layer = event.layer;
      if (layer instanceof L.Marker) {
        const point = layer.getLatLng();
        coords.push([point.lat, point.lng]);
      } else if (layer instanceof L.Polyline) {
        (layer.getLatLngs() as import('leaflet').LatLng[]).forEach((latLng) => {
          coords.push([latLng.lat, latLng.lng]);
        });
      }
      dispatch('waypointCreated', { robotId: selectedRobotIdValue, coordinates: coords });
    });

    unsubscribeRobots = robots.subscribe((robotList) => syncMarkers(robotList));
    unsubscribeSelection = selectedRobotId.subscribe((robotId) => {
      selectedRobotIdValue = robotId;
      highlightRobot(robotId);
    });
  });

  onDestroy(() => {
    unsubscribeRobots?.();
    unsubscribeSelection?.();
    markerCache.forEach((marker) => marker.remove());
    markerCache.clear();
    trailCache.forEach(({ shadow, path }) => {
      shadow.remove();
      path.remove();
    });
    trailCache.clear();
    map?.remove();
  });
</script>

<div class="h-full w-full relative">
  <div bind:this={container} class="absolute inset-0"></div>
  <div class="absolute top-2 left-2 flex items-center gap-2 bg-slate-900/80 text-white px-3 py-2 rounded">
    <span
      class="h-2 w-2 rounded-full"
      class:bg-green-400={$socketState === 'connected'}
      class:bg-yellow-400={$socketState === 'connecting'}
      class:bg-red-500={$socketState === 'error' || $socketState === 'disconnected'}
    ></span>
    <span class="text-sm uppercase tracking-wide">{$socketState}</span>
  </div>
</div>

<style>
  :global(.robot-symbol svg) {
    /* width: 48px;
    height: 48px; */
  }
</style>


# Robot Command & Control (RCC)

This Svelte 5 + TypeScript control interface provides operators, mission commanders, and administrators with a real-time common operating picture for autonomous robots. It integrates Leaflet for mapping, milsymbol APP-6E symbology, TailwindCSS styling, and Appwrite + WebSocket service abstractions for authentication, mission data, and telemetry routing.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open the provided local URL (default `http://localhost:5173`).

The project expects the following environment variables when connecting to live services:

```bash
PUBLIC_APPWRITE_ENDPOINT=https://appwrite.yourdomain.com/v1
PUBLIC_APPWRITE_PROJECT_ID=rcc-project
PUBLIC_APPWRITE_PROJECT_NAME=rcc-project
VITE_RTC_GATEWAY=wss://gateway.yourdomain.com/telemetry
```

## Key Features

- **Leaflet Map with milsymbol icons** (`src/lib/components/MapView.svelte`) renders robot positions, supports waypoint drawing via `leaflet-draw`, and streams telemetry updates from `$services/websocket`.
- **Robot Stores & Telemetry** (`src/lib/stores/robots.ts`) maintain live state, playback cursors, and selection for UI panels.
- **Mission Brief & Role-based Panels** combine mission markdown (`MissionBrief.svelte`), robot control (`CommandPanel.svelte`), camera preview stubs (`CameraView.svelte`), and timeline controls (`TimelineScrubber.svelte`).
- **Appwrite Integration Layer** (`src/lib/services/appwrite.ts`) centralises auth + mission queries with graceful fallbacks for development.
- **Dual-screen Dashboard Layout** (`src/routes/+page.svelte`) stacks map on the top display while lower panes host detail, command, and briefing content.

## Next Steps

- Configure Appwrite collections (`missions`, `telemetry_points`, `commands`, etc.) and update the service layer queries.
- Connect the WebSocket gateway to live robot telemetry and command handling.
- Implement WebRTC negotiation inside `CameraView.svelte` once the signaling path is ready.
- Expand role-based permissions (operator vs commander vs admin) with guarded routes and Appwrite session claims.

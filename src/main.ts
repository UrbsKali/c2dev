import { connectRealtime } from '$services/websocket';
import { loadActiveMission } from '$stores/missions';
import { hydrateUser } from '$stores/user';
import { initEvents } from '$stores/events';
import { startHealthMonitor } from '$monitoring';

export async function bootstrap(): Promise<void> {
  await hydrateUser();
  await loadActiveMission();
  void initEvents();
  startHealthMonitor();
  connectRealtime();
}

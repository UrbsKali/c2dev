import { connectRealtime } from '$services/websocket';
import { loadActiveMission } from '$stores/missions';
import { hydrateUser } from '$stores/user';

export async function bootstrap(): Promise<void> {
  await hydrateUser();
  await loadActiveMission();
  connectRealtime();
}

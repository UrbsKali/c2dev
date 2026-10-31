import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabaseClient, COMMANDS_TABLE } from '../../src/lib/services/supabase';
import { sendCommand } from '../../src/lib/services/websocket';
import type { Command } from '../../src/lib/types';

const ROBOT_UUID = '3f2b8c1e-9d4a-4e7b-8a61-0c5d2f7e9a10';
const OPERATOR_UUID = '7a1d5e22-4b3c-4f08-9e11-2a6c8d0b4f33';
const COMMAND_UUID = 'c0ffee00-1111-4222-8333-444455556666';

describe('Supabase Command Delivery Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('formats payload correctly and calls Supabase from(commands).insert', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const fromSpy = vi.spyOn(supabaseClient, 'from').mockReturnValue({
      insert: insertMock
    } as unknown as ReturnType<typeof supabaseClient.from>);

    const testCommand: Command = {
      id: COMMAND_UUID,
      issuedBy: OPERATOR_UUID,
      robotId: ROBOT_UUID,
      commandType: 'teleop',
      payload: { linear: { x: 1.0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0.5 } },
      status: 'queued',
      issuedAt: '2026-10-30T18:00:00.000Z'
    };

    await sendCommand(testCommand);

    expect(fromSpy).toHaveBeenCalledWith(COMMANDS_TABLE);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      id: COMMAND_UUID,
      robot_id: ROBOT_UUID,
      command_type: 'teleop',
      payload: testCommand.payload,
      status: 'queued',
      issued_by: OPERATOR_UUID,
      issued_at: '2026-10-30T18:00:00.000Z'
    });
  });

  it('handles database errors gracefully without crashing the UI teleop thread', async () => {
    vi.spyOn(supabaseClient, 'from').mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { message: 'Database connection failed' } })
    } as unknown as ReturnType<typeof supabaseClient.from>);

    const testCommand: Command = {
      id: COMMAND_UUID,
      issuedBy: OPERATOR_UUID,
      robotId: ROBOT_UUID,
      commandType: 'teleop',
      payload: { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } },
      status: 'queued',
      issuedAt: new Date().toISOString()
    };

    // Should not throw and crash
    await expect(sendCommand(testCommand)).resolves.not.toThrow();
  });

  it('sends issued_by as null when the operator id is not a uuid (anonymous test operator)', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.spyOn(supabaseClient, 'from').mockReturnValue({ insert: insertMock } as unknown as ReturnType<typeof supabaseClient.from>);

    await sendCommand({
      id: COMMAND_UUID,
      issuedBy: 'teleop-operator',
      robotId: ROBOT_UUID,
      commandType: 'teleop',
      payload: {},
      status: 'queued',
      issuedAt: '2026-10-30T18:00:00.000Z'
    });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ issued_by: null }));
  });

  it('does not write to the database for a non-uuid robot id (simulated robot)', async () => {
    const fromSpy = vi.spyOn(supabaseClient, 'from');

    await sendCommand({
      id: COMMAND_UUID,
      issuedBy: OPERATOR_UUID,
      robotId: 'sim-ghost',
      commandType: 'teleop',
      payload: {},
      status: 'queued',
      issuedAt: '2026-10-30T18:00:00.000Z'
    });

    expect(fromSpy).not.toHaveBeenCalled();
  });
});

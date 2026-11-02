import { beforeEach, describe, expect, it } from 'vitest';
import { fixedClock, memorySql, sequentialIds } from '../testing/node-sql';
import { GroupService } from './group-service';
import type { GoogleProfile } from './members';

const profile = (email: string, name = email.split('@')[0]): GoogleProfile => ({ sub: `sub:${email}`, email, name, picture: null });
const ADMIN = 'ana@example.com';
const swim = { name: 'Natação', sport: 'Swim', durationSeconds: 3600, days: [2, 0], time: '08:00' };

let service: GroupService;
const ana = 'h-ana';
const bia = 'h-bia';

beforeEach(() => {
  service = new GroupService(memorySql(), fixedClock('2026-11-02T19:00:00Z'), sequentialIds());
  service.migrate();
  service.signIn(profile(ADMIN, 'Ana'), ana, [ADMIN]);
  service.command(ana, 'invite.create', { email: 'bia@example.com' });
  service.signIn(profile('bia@example.com', 'Bia'), bia, []);
});

function create(hash: string, input: Record<string, unknown> = swim): string {
  const result = service.command(hash, 'activityTemplate.create', input);
  if (!result.ok) throw new Error(result.error);
  return (result.value as { id: string }).id;
}

describe('activity templates', () => {
  it('keeps each member her own, sorted by name', () => {
    create(ana);
    create(ana, { ...swim, name: 'academia', sport: 'WeightTraining', days: [1, 3], time: '10:00' });
    const list = service.query(ana, 'activityTemplates', {});
    expect(list).toMatchObject({ ok: true, value: [{ name: 'academia' }, { name: 'Natação', days: [0, 2], time: '08:00', durationSeconds: 3600 }] });
    expect(service.query(bia, 'activityTemplates', {})).toEqual({ ok: true, value: [] });
  });

  it('says the templates changed, not the activities', () => {
    expect(service.command(ana, 'activityTemplate.create', swim)).toMatchObject({ ok: true, changed: ['templates'] });
  });

  it('refuses an invalid template', () => {
    expect(service.command(ana, 'activityTemplate.create', { ...swim, time: '25:00' })).toEqual({ ok: false, error: 'invalid' });
  });

  it('lets only the owner edit and delete', () => {
    const id = create(ana);
    expect(service.command(bia, 'activityTemplate.update', { ...swim, templateId: id, name: 'Minha' })).toEqual({ ok: false, error: 'not_found' });
    expect(service.command(bia, 'activityTemplate.delete', { templateId: id })).toEqual({ ok: false, error: 'not_found' });
    expect(service.command(ana, 'activityTemplate.update', { ...swim, templateId: id, durationSeconds: 2700 })).toMatchObject({
      ok: true,
      value: { id, durationSeconds: 2700 },
    });
    expect(service.command(ana, 'activityTemplate.delete', { templateId: id })).toMatchObject({ ok: true });
    expect(service.query(ana, 'activityTemplates', {})).toEqual({ ok: true, value: [] });
  });

  it('goes away when the member leaves the group', () => {
    create(bia);
    const members = service.query(ana, 'members', {});
    const biaId = (members.ok ? (members.value as { id: string; name: string }[]) : []).find((m) => m.name === 'Bia')?.id;
    expect(service.command(ana, 'member.remove', { memberId: biaId })).toMatchObject({ ok: true });
    service.command(ana, 'invite.create', { email: 'bia@example.com' });
    service.signIn(profile('bia@example.com', 'Bia'), bia, []);
    expect(service.query(bia, 'activityTemplates', {})).toEqual({ ok: true, value: [] });
  });
});

import Phaser from 'phaser';
import { loadAvatar, needsName } from './character/appearance';
import { gameConfig } from './game/config';
import { fetchOffice } from './net/office';
import { readOfficeRoute } from './net/route';
import { promptName } from './ui/gate';
import { promptCreateOffice } from './ui/officeCreate';
import { applyOfficeSnapshot, currentOfficeName, useLocalOffice } from './world/layout';
import { DEFAULT_OFFICE_SLUG } from '../shared/protocol';

async function boot(): Promise<void> {
  const avatar = loadAvatar();
  if (needsName(avatar)) await promptName(avatar);

  const route = readOfficeRoute();
  if (route.kind === 'create') {
    try {
      await promptCreateOffice({
        title: 'Novo escritório',
        copy: 'O slug vira o endereço. Todo mundo que abrir esse link entra neste mapa.',
      });
    } catch {
      location.replace('/');
    }
    return;
  }

  const office = await fetchOffice(route.slug);
  if (!office && route.slug !== DEFAULT_OFFICE_SLUG) {
    try {
      await promptCreateOffice({
        title: 'Criar este escritório',
        copy: `Ninguém criou /${route.slug} ainda. Dá um nome e confirma o slug.`,
        slug: route.slug,
      });
    } catch {
      location.replace('/');
    }
    return;
  }
  if (office) applyOfficeSnapshot(office);
  else useLocalOffice();
  document.title = `${currentOfficeName()} · Meeting Office`;
  new Phaser.Game(gameConfig);
}

void boot();

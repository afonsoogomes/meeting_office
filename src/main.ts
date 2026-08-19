import Phaser from 'phaser';
import { loadAvatar, needsName } from './character/appearance';
import { gameConfig } from './game/config';
import { fetchOffice } from './net/office';
import { promptName } from './ui/gate';
import { applyOfficeSnapshot, useLocalOffice } from './world/layout';

async function boot(): Promise<void> {
  const avatar = loadAvatar();
  if (needsName(avatar)) await promptName(avatar);
  const office = await fetchOffice();
  if (office) applyOfficeSnapshot(office);
  else useLocalOffice();
  new Phaser.Game(gameConfig);
}

void boot();

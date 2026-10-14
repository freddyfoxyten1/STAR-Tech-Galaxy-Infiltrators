/**
 * The Armory Store in the Enforcement Barracks: weapon overhauls, gun attachments and
 * squad accessories bought with squad points. Gadget unlock prices live in equipment.ts
 * (GADGET_STORE); squad gear is data.ts GEAR. heroStats() (data.ts) applies all of it.
 */
export type WeaponSlotKey = "primary" | "secondary" | "melee";

export const WEAPON_UPGRADE_COSTS = [50, 90, 150];
export const WEAPON_UPGRADES: { key: WeaponSlotKey; name: string; desc: string }[] = [
  { key: "primary", name: "Main Gun Overhaul", desc: "+10% damage and 10% faster reloads per level" },
  { key: "secondary", name: "Sidearm Overhaul", desc: "+15% damage and +15% magazine per level" },
  { key: "melee", name: "Melee Sharpening", desc: "+15% damage and 8% faster swings per level" },
];

/** Multipliers an attachment applies to a gun (anything left out stays at 1, zoom adds). */
export interface GunMods {
  dmg: number;
  /** spread while aiming down sights */
  adsSpread: number;
  /** spread from the hip */
  hipSpread: number;
  /** extra zoom when aiming */
  zoom: number;
  noise: number;
  recoil: number;
  mag: number;
  reload: number;
}
export const NO_MODS: GunMods = { dmg: 1, adsSpread: 1, hipSpread: 1, zoom: 0, noise: 1, recoil: 1, mag: 1, reload: 1 };

export interface AttachDef {
  id: string;
  slot: "primary" | "secondary";
  name: string;
  desc: string;
  cost: number;
  mods: Partial<GunMods>;
}

export const ATTACHMENTS: AttachDef[] = [
  { id: "optic", slot: "primary", name: "Precision Optic", desc: "Stronger zoom and 30% tighter shots when aiming", cost: 60, mods: { zoom: 0.35, adsSpread: 0.7 } },
  { id: "laser", slot: "primary", name: "Laser Sight", desc: "35% tighter hip-fire, with a red aiming laser", cost: 55, mods: { hipSpread: 0.65 } },
  { id: "suppressor", slot: "primary", name: "Suppressor", desc: "Shots are 70% quieter so robots rarely hear them (-5% damage)", cost: 80, mods: { noise: 0.3, dmg: 0.95 } },
  { id: "stabiliser", slot: "primary", name: "Recoil Stabiliser", desc: "Half the kick and 15% tighter spread", cost: 50, mods: { recoil: 0.5, adsSpread: 0.85, hipSpread: 0.85 } },
  { id: "drum", slot: "primary", name: "Drum Magazine", desc: "+50% magazine size, 15% slower reloads", cost: 70, mods: { mag: 1.5, reload: 1.15 } },
  { id: "s_suppressor", slot: "secondary", name: "Sidearm Suppressor", desc: "Sidearm shots are 70% quieter", cost: 50, mods: { noise: 0.3 } },
  { id: "s_laser", slot: "secondary", name: "Sidearm Laser", desc: "35% tighter sidearm hip-fire, with a red aiming laser", cost: 40, mods: { hipSpread: 0.65 } },
  { id: "s_drum", slot: "secondary", name: "Sidearm Extended Mag", desc: "+50% sidearm magazine", cost: 45, mods: { mag: 1.5 } },
];

/** Combine the attachments a hero has fitted on one gun. */
export function gunMods(ids: string[], slot: "primary" | "secondary"): GunMods {
  const m = { ...NO_MODS };
  for (const a of ATTACHMENTS) {
    if (a.slot !== slot || !ids.includes(a.id)) continue;
    m.dmg *= a.mods.dmg ?? 1;
    m.adsSpread *= a.mods.adsSpread ?? 1;
    m.hipSpread *= a.mods.hipSpread ?? 1;
    m.zoom += a.mods.zoom ?? 0;
    m.noise *= a.mods.noise ?? 1;
    m.recoil *= a.mods.recoil ?? 1;
    m.mag *= a.mods.mag ?? 1;
    m.reload *= a.mods.reload ?? 1;
  }
  return m;
}

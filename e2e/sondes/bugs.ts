/** Registre des sondes de bugs : l'ordre de ce tableau est celui du rapport. */
import type { Sonde } from "./harness";
import { SONDES_CADRE } from "./bugs-cadre";
import { SONDES_DIVERS } from "./bugs-divers";
import { SONDES_MOBILE } from "./bugs-mobile";
import { SONDES_OPACITES } from "./bugs-opacites";
import { SONDES_STUDIO } from "./bugs-studio";
import { SONDES_TEXTE } from "./bugs-texte";

export const SONDES_BUGS: readonly Sonde[] = [
  ...SONDES_TEXTE,
  ...SONDES_OPACITES,
  ...SONDES_CADRE,
  ...SONDES_MOBILE,
  ...SONDES_STUDIO,
  ...SONDES_DIVERS,
];

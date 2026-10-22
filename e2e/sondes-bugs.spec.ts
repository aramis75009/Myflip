/**
 * Sondes chiffrées des bugs du PRD § 1 (21 bugs) et des 15 relevés en plus de
 * l'étude (docs/refonte/etude-2026-10-20/bugs-sondes.json), plus les sondes
 * globales par route. Mode d'emploi, mesures et critères « corrigé » :
 * e2e/sondes/LISEZMOI.md. Résultats : e2e/rapports/<serie>/sondes.json.
 *
 * Mode normal : documente l'avant, n'échoue pas sur un bug présent.
 * SONDES_STRICT=1 : échoue si un état n'est pas « corrigé ».
 */
import { SONDES_BUGS } from "./sondes/bugs";
import { SONDES_GLOBALES } from "./sondes/globales";
import { declarerSondes } from "./sondes/harness";

declarerSondes(SONDES_BUGS, "bugs");
declarerSondes(SONDES_GLOBALES, "globales");

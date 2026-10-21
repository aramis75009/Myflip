/**
 * Postgres EMBARQUÉ de la suite e2e (paquet embedded-postgres, binaires
 * darwin-arm64 dans node_modules). Jamais Neon : ni la prod, ni la dev.
 *
 *  - cluster dans .e2e-db.nosync/<decalage>/data, port 5433+D, n'écoute que
 *    sur localhost, sans socket Unix ;
 *  - base « myflip_e2e » SUPPRIMÉE puis recréée à chaque lancement ;
 *  - `prisma migrate deploy` ; si l'historique ne s'applique pas sur une base
 *    vide, repli SIGNALÉ sur `prisma db push --skip-generate` (cette base
 *    locale seulement) ;
 *  - puis le seed (e2e/seed/seed-e2e.ts) en ligne de commande.
 *
 * Tout ce qui écrit refuse une DATABASE_URL dont l'hôte n'est pas une boucle
 * locale (`exigerBaseLocale`).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import EmbeddedPostgres from "embedded-postgres";

import {
  BASE,
  DATABASE_URL_E2E,
  DOSSIERS,
  ENCRYPTION_KEY_E2E,
  PORTS,
  RACINE,
  SEED,
  estUrlLocale,
  seedPresent,
} from "../outils/environnement";

const DOSSIER_DONNEES = path.join(DOSSIERS.base, "data");
const JOURNAL_POSTGRES = path.join(DOSSIERS.base, "postgres.log");
const PG_CTL = path.join(RACINE, "node_modules", "@embedded-postgres", "darwin-arm64", "native", "bin", "pg_ctl");

/** Lève si l'URL n'est pas une base locale, ou si elle ressemble à Neon. */
export function exigerBaseLocale(url: string | undefined): asserts url is string {
  if (!url || !estUrlLocale(url) || /neon\.tech|ep-curly-haze|ep-autumn-morning/i.test(url)) {
    throw new Error("[e2e] Refus : DATABASE_URL n'est pas une base Postgres locale (localhost, 127.0.0.1, ::1).");
  }
}

let instance: EmbeddedPostgres | null = null;

function journal(message: string): void {
  fs.mkdirSync(DOSSIERS.base, { recursive: true });
  fs.appendFileSync(JOURNAL_POSTGRES, message.endsWith("\n") ? message : message + "\n");
}

function portOccupe(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });
}

function pidVivant(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Arrête un Postgres resté en marche sur NOTRE dossier (lancement précédent interrompu). */
function arreterResteEventuel(): void {
  const fichierPid = path.join(DOSSIER_DONNEES, "postmaster.pid");
  if (!fs.existsSync(fichierPid)) return;
  const pid = Number(fs.readFileSync(fichierPid, "utf8").split("\n")[0]);
  if (!Number.isInteger(pid) || !pidVivant(pid)) return;
  console.warn(`[e2e] Un Postgres e2e est resté en marche (pid ${pid}) : arrêt avant relance.`);
  spawnSync(PG_CTL, ["stop", "-D", DOSSIER_DONNEES, "-m", "fast", "-w"], { stdio: "ignore" });
}

const FLAGS_INITDB = [
  "--encoding=UTF8",
  "--locale=C",
  // Tri par point de code, identique d'une machine à l'autre (pas de locale libc).
  "--locale-provider=builtin",
  "--builtin-locale=C.UTF-8",
];

const FLAGS_POSTGRES = [
  "-c", "listen_addresses=localhost",
  "-c", "unix_socket_directories=",
  // Base jetable : la durabilité ne sert à rien, la vitesse si.
  "-c", "fsync=off",
  "-c", "synchronous_commit=off",
  "-c", "full_page_writes=off",
];

/** Démarre le cluster (créé au besoin) et recrée la base vide. */
export async function demarrerPostgres(): Promise<void> {
  exigerBaseLocale(DATABASE_URL_E2E);
  fs.mkdirSync(DOSSIERS.base, { recursive: true });
  fs.writeFileSync(JOURNAL_POSTGRES, "");
  arreterResteEventuel();
  if (await portOccupe(PORTS.postgres)) {
    throw new Error(
      `[e2e] Le port ${PORTS.postgres} est déjà pris par un autre programme : arrêter celui-ci, ou changer E2E_DECALAGE.`,
    );
  }

  const pg = new EmbeddedPostgres({
    databaseDir: DOSSIER_DONNEES,
    port: PORTS.postgres,
    user: BASE.utilisateur,
    password: BASE.motDePasse,
    authMethod: "scram-sha-256",
    persistent: true,
    initdbFlags: FLAGS_INITDB,
    postgresFlags: FLAGS_POSTGRES,
    onLog: journal,
    onError: (e: unknown) => journal(`[ERREUR] ${e instanceof Error ? e.message : String(e)}`),
  });

  if (!fs.existsSync(path.join(DOSSIER_DONNEES, "PG_VERSION"))) {
    fs.rmSync(DOSSIER_DONNEES, { recursive: true, force: true });
    await pg.initialise();
  }
  try {
    await pg.start();
  } catch {
    throw new Error(`[e2e] Postgres n'a pas démarré : voir ${path.relative(RACINE, JOURNAL_POSTGRES)}.`);
  }
  instance = pg;

  const client = pg.getPgClient("postgres", "localhost");
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${BASE.nom}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${BASE.nom}"`);
  } finally {
    await client.end();
  }
}

/** Arrête le Postgres de ce lancement ; à défaut de poignée, `pg_ctl stop` sur le dossier. */
export async function arreterPostgres(): Promise<void> {
  if (instance) {
    await instance.stop();
    instance = null;
    return;
  }
  if (fs.existsSync(path.join(DOSSIER_DONNEES, "postmaster.pid"))) {
    spawnSync(PG_CTL, ["stop", "-D", DOSSIER_DONNEES, "-m", "fast", "-w"], { stdio: "ignore" });
  }
}

/**
 * Environnement des commandes Prisma et du seed : la base locale, la clé
 * factice, rien d'autre de sensible. DATABASE_URL étant posée, le `.env` du
 * dépôt (qui vise Neon) ne l'écrase pas.
 */
function envOutils(): NodeJS.ProcessEnv {
  // Sans VERCEL (le seed refuse de tourner), NODE_ENV ni NODE_OPTIONS du shell.
  const herite: Record<string, string | undefined> = { ...process.env };
  for (const nom of ["VERCEL", "NODE_ENV", "NODE_OPTIONS"]) delete herite[nom];
  const env: NodeJS.ProcessEnv = {
    ...(herite as NodeJS.ProcessEnv),
    DATABASE_URL: DATABASE_URL_E2E,
    ENCRYPTION_KEY: ENCRYPTION_KEY_E2E,
    CHECKPOINT_DISABLE: "1",
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
    TZ: "Europe/Paris",
    E2E: "1",
  };
  exigerBaseLocale(env.DATABASE_URL);
  return env;
}

function lancer(args: string[], titre: string): { ok: boolean; sortie: string } {
  const r = spawnSync(process.execPath, args, { cwd: RACINE, env: envOutils(), encoding: "utf8", timeout: 180_000 });
  const sortie = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return { ok: r.status === 0, sortie: `[${titre}]\n${sortie}` };
}

const PRISMA_CLI = path.join(RACINE, "node_modules", "prisma", "build", "index.js");
const TSX_CLI = path.join(RACINE, "node_modules", "tsx", "dist", "cli.mjs");

export type ResultatMigration = { methode: "migrate deploy" | "db push (repli)"; journal: string };

/** `prisma migrate deploy`, repli signalé sur `db push` si l'historique ne s'applique pas à vide. */
export function migrer(): ResultatMigration {
  // Prisma affiche la base visée. On le vérifie d'abord avec une commande en
  // LECTURE (`migrate status`) : si le `.env` du dépôt l'emportait, on
  // s'arrêterait avant toute écriture.
  const cible = new RegExp(`"localhost:${PORTS.postgres}"`);
  const statut = lancer([PRISMA_CLI, "migrate", "status"], "prisma migrate status");
  if (!cible.test(statut.sortie)) {
    throw new Error(`[e2e] Prisma ne vise pas localhost:${PORTS.postgres} : arrêt avant toute écriture.`);
  }
  const deploy = lancer([PRISMA_CLI, "migrate", "deploy"], "prisma migrate deploy");
  if (!cible.test(deploy.sortie)) {
    throw new Error(`[e2e] prisma migrate deploy n'a pas visé localhost:${PORTS.postgres}.`);
  }
  if (deploy.ok) return { methode: "migrate deploy", journal: deploy.sortie };

  console.warn(
    "\n[e2e] ⚠️ prisma migrate deploy a ÉCHOUÉ sur la base vide : repli sur prisma db push (base locale e2e seulement).\n" +
      deploy.sortie.split("\n").slice(-15).join("\n"),
  );
  // Base neuve : on repart d'une base vide avant le push.
  const push = lancer([PRISMA_CLI, "db", "push", "--skip-generate"], "prisma db push");
  if (!push.ok) throw new Error(`[e2e] prisma db push a échoué aussi :\n${push.sortie}`);
  return { methode: "db push (repli)", journal: `${deploy.sortie}\n${push.sortie}` };
}

/** Lance le seed en ligne de commande. Rend false (avec un avertissement) s'il n'existe pas encore. */
export function semer(): boolean {
  if (!seedPresent()) {
    console.warn(
      `\n[e2e] ⚠️ ${path.relative(RACINE, SEED)} est ABSENT : base migrée mais VIDE. ` +
        "Les comptes de test n'existent pas, la connexion (projet « setup ») échouera.\n",
    );
    return false;
  }
  const r = lancer([TSX_CLI, "--conditions=react-server", SEED], "seed e2e");
  if (!r.ok) throw new Error(`[e2e] Le seed a échoué :\n${r.sortie}`);
  return true;
}

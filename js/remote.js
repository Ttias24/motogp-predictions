// Allt som pratar med databasen (Supabase). Laddas bara om config.js är ifylld.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let clientPromise = null;
export function client() {
  if (!isConfigured()) throw new Error("Databasen är inte konfigurerad (js/config.js).");
  clientPromise ??= import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm").then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  );
  return clientPromise;
}

/** Felkod från databasfunktionerna, t.ex. "closed" eller "incomplete:Moto2". */
function codeOf(error) {
  return String(error?.message ?? error).trim();
}

async function rpc(name, args) {
  const sb = await client();
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    const err = new Error(codeOf(error));
    err.code = codeOf(error);
    throw err;
  }
  return data;
}

// ---- Spelare (inbjudningslänk) ----
export const myEntry = (token) => rpc("my_entry", { p_token: token });
export const saveMyPicks = (token, data, name) => rpc("save_my_picks", { p_token: token, p_data: data, p_name: name });
export const activateMyBackup = (token, cls, replaces) =>
  rpc("activate_my_backup", { p_token: token, p_class: cls, p_replaces: replaces });

// ---- Alla besökare ----
export const seasonOverview = (year) => rpc("season_overview", { p_year: year });
/** Gå med via delad inbjudningslänk → { token, name, season, approved } */
export const joinSeason = (code, name) => rpc("join_season", { p_code: code, p_name: name });

// ---- Admin ----
export async function getSession() {
  const sb = await client();
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function sendLoginLink(email, redirectTo) {
  const sb = await client();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
  if (error) throw error;
}

export async function signOut() {
  const sb = await client();
  await sb.auth.signOut();
}

export const isAdmin = () => rpc("is_admin", {});

async function table(name) {
  return (await client()).from(name);
}
function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export async function getSeason(year) {
  return check(await (await table("seasons")).select("*").eq("year", year).maybeSingle());
}
export async function createSeason(row) {
  return check(await (await table("seasons")).insert(row).select().single());
}
export async function updateSeason(year, fields) {
  return check(await (await table("seasons")).update(fields).eq("year", year).select().single());
}
export async function listPlayers(year) {
  return check(
    await (await table("players"))
      .select("id, name, label, approved, created_at, picks(data, submitted_at, updated_at)")
      .eq("season", year)
      .order("created_at")
  );
}
/** Personlig inbjudan utan namn – spelaren väljer namnet själv. label = anteckning för admin. */
export const createPlayer = (year, label) => rpc("admin_create_player", { p_season: year, p_label: label });
export const newToken = (playerId) => rpc("admin_new_token", { p_player: playerId });
export const newJoinCode = (year) => rpc("admin_new_join_code", { p_season: year });
export async function approvePlayer(id) {
  return check(await (await table("players")).update({ approved: true }).eq("id", id));
}
export async function renamePlayer(id, name) {
  return check(await (await table("players")).update({ name }).eq("id", id));
}
export async function deletePlayer(id) {
  return check(await (await table("players")).delete().eq("id", id));
}
export async function adminSavePicks(playerId, data) {
  return check(
    await (await table("picks")).upsert({ player_id: playerId, data, updated_at: new Date().toISOString() }).select().single()
  );
}

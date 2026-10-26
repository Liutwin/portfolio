// Endpoint de contact du portfolio — Deno, sans framework.
// Deux routes : GET /api/contact/token (jeton signé) et POST /api/contact (envoi).
import nodemailer from "npm:nodemailer@6.9.16";

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
};

const PORT = Number(Deno.env.get("PORT") ?? "8000");
const TOKEN_SECRET = env("TOKEN_SECRET");
const MAIL_TO = env("MAIL_TO");
const SMTP_USER = env("SMTP_USER");
const SMTP_PORT = Number(env("SMTP_PORT"));

const MIN_DELAY_MS = 3_000; // soumis en moins de 3 s → bot
const MAX_AGE_MS = 2 * 60 * 60 * 1_000; // jeton valable 2 h
const MAX_LINKS = 2;

const transporter = nodemailer.createTransport({
  host: env("SMTP_HOST"),
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: env("SMTP_PASSWORD") },
});

// --- Jeton horodaté signé (HMAC-SHA256) -------------------------------------
// Le formulaire récupère un jeton au chargement de la page. Un bot qui poste
// directement sans charger la page n'en a pas ; un bot trop rapide est rejeté.

const encoder = new TextEncoder();
const hmacKey = await crypto.subtle.importKey(
  "raw",
  encoder.encode(TOKEN_SECRET),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string) =>
  new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));

export async function issueToken(now = Date.now()): Promise<string> {
  const ts = now.toString();
  const sig = await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(ts));
  return `${ts}.${toHex(sig)}`;
}

export async function checkToken(token: unknown, now = Date.now()): Promise<string | null> {
  if (typeof token !== "string" || !/^\d{13}\.[0-9a-f]{64}$/.test(token)) return "jeton invalide";
  const [ts, sig] = token.split(".");
  const valid = await crypto.subtle.verify("HMAC", hmacKey, fromHex(sig), encoder.encode(ts));
  if (!valid) return "signature invalide";
  const age = now - Number(ts);
  if (age < MIN_DELAY_MS) return "envoi trop rapide";
  if (age > MAX_AGE_MS) return "jeton expiré";
  return null;
}

// --- Validation ---------------------------------------------------------------

type Contact = { name: string; email: string; message: string };

export function validate(body: Record<string, unknown>): Contact | string {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (name.length < 2 || name.length > 100) return "Indiquez votre nom (100 caractères au plus).";
  if (/[\r\n]/.test(name)) return "Le nom ne doit pas contenir de retour à la ligne.";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return "L’adresse e-mail n’est pas valide.";
  }
  if (message.length < 10 || message.length > 5_000) {
    return "Le message doit faire entre 10 et 5 000 caractères.";
  }
  const links = message.match(/https?:\/\/|www\./gi)?.length ?? 0;
  if (links > MAX_LINKS) return "Le message contient trop de liens.";
  return { name, email, message };
}

// --- Routes -------------------------------------------------------------------

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function handleContact(req: Request): Promise<Response> {
  const ip = req.headers.get("x-real-ip") ?? "inconnue";
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Requête invalide." });
  }

  // Honeypot rempli : on répond « ok » sans rien envoyer, pour ne pas renseigner le bot.
  if (typeof body.website === "string" && body.website !== "") {
    console.log(`[spam] honeypot rempli — ip=${ip}`);
    return json(200, { ok: true });
  }

  const tokenError = await checkToken(body.token);
  if (tokenError) {
    console.log(`[spam] ${tokenError} — ip=${ip}`);
    return json(400, { ok: false, error: "Le formulaire a expiré. Rechargez la page puis réessayez." });
  }

  const contact = validate(body);
  if (typeof contact === "string") return json(422, { ok: false, error: contact });

  try {
    await transporter.sendMail({
      from: `Portfolio liutwin.com <${SMTP_USER}>`,
      to: MAIL_TO,
      replyTo: { name: contact.name, address: contact.email },
      subject: `[Portfolio] Message de ${contact.name}`,
      text: `${contact.message}\n\n—\n${contact.name} <${contact.email}>\nIP : ${ip}`,
    });
    console.log(`[ok] message de ${contact.email} — ip=${ip}`);
    return json(200, { ok: true });
  } catch (err) {
    console.error("[smtp] échec d'envoi :", err);
    return json(502, { ok: false, error: "L’envoi a échoué. Réessayez dans quelques minutes." });
  }
}

export async function handler(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (pathname === "/api/contact/token" && req.method === "GET") {
    return json(200, { token: await issueToken() });
  }
  if (pathname === "/api/contact" && req.method === "POST") return handleContact(req);
  if (pathname === "/api/health") return json(200, { ok: true });
  return json(404, { ok: false, error: "Introuvable." });
}

if (import.meta.main) {
  Deno.serve({ port: PORT, hostname: "0.0.0.0" }, handler);
}

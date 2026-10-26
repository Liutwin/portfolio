// deno task test
Deno.env.set("TOKEN_SECRET", "secret-de-test");
Deno.env.set("MAIL_TO", "test@example.com");
Deno.env.set("SMTP_USER", "test@example.com");
Deno.env.set("SMTP_PASSWORD", "x");
Deno.env.set("SMTP_HOST", "127.0.0.1");
Deno.env.set("SMTP_PORT", "2525"); // rien n'écoute : l'envoi doit échouer proprement

const { handler, issueToken, checkToken, validate } = await import("./main.ts");

const assertEq = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
};
const post = (body: unknown) =>
  handler(new Request("http://x/api/contact", { method: "POST", body: JSON.stringify(body) }));
const ok = { name: "Recruteur", email: "rh@exemple.fr", message: "Bonjour, votre profil nous intéresse." };

Deno.test("jeton : trop rapide, valide, expiré, falsifié", async () => {
  const now = Date.now();
  assertEq(await checkToken(await issueToken(now), now), "envoi trop rapide");
  assertEq(await checkToken(await issueToken(now - 10_000), now), null);
  assertEq(await checkToken(await issueToken(now - 3 * 3600_000), now), "jeton expiré");
  const forged = `${now - 10_000}.${"a".repeat(64)}`;
  assertEq(await checkToken(forged, now), "signature invalide");
  assertEq(await checkToken(undefined, now), "jeton invalide");
});

Deno.test("validation", () => {
  assertEq(typeof validate(ok), "object");
  assertEq(validate({ ...ok, email: "pas-un-mail" }), "L’adresse e-mail n’est pas valide.");
  assertEq(validate({ ...ok, name: "A\nBcc: x@y.z" }), "Le nom ne doit pas contenir de retour à la ligne.");
  assertEq(validate({ ...ok, message: "http://a http://b http://c" }), "Le message contient trop de liens.");
});

Deno.test("honeypot : 200 sans envoi", async () => {
  const res = await post({ ...ok, website: "spam.com" });
  assertEq([res.status, await res.json()], [200, { ok: true }]);
});

Deno.test("sans jeton : 400", async () => {
  assertEq((await post(ok)).status, 400);
});

Deno.test("jeton valide mais SMTP injoignable : 502", async () => {
  const token = await issueToken(Date.now() - 10_000);
  const res = await post({ ...ok, token });
  assertEq(res.status, 502);
});

Deno.test("route token", async () => {
  const res = await handler(new Request("http://x/api/contact/token"));
  const { token } = await res.json();
  assertEq(/^\d{13}\.[0-9a-f]{64}$/.test(token), true);
});

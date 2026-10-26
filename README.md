# Formulaire de contact — portfolio liutwin.com

Le site reste statique (servi par le Nginx de l’hôte). Seul l’endpoint de contact tourne dans un conteneur Deno, joignable uniquement en local.

```
navigateur ──HTTPS──▶ Nginx (hôte) ──┬── /            → /srv/portfolio/frontend (dossier frontend/)
                                     └── /api/contact → 127.0.0.1:8010 → conteneur Deno ──SMTP──▶ contact@liutwin.com
```

Le formulaire de la page récupère un jeton via `GET /api/contact/token`, puis envoie le nom, l’adresse de réponse et le message à `POST /api/contact`. Le lien e-mail est recomposé par JavaScript pour décourager les robots les plus rudimentaires ; les robots qui exécutent JavaScript peuvent tout de même le récupérer. Pour réduire les spams, privilégier le formulaire et appliquer un filtre anti-spam à la boîte de réception.

## Protections anti-spam

| Couche | Où | Effet |
|---|---|---|
| Honeypot `website` | backend | Rempli → réponse 200, rien n’est envoyé |
| Jeton HMAC horodaté | backend | Absent, falsifié, < 3 s ou > 2 h → rejet |
| Validation | backend | Longueurs, format e-mail, 2 liens au plus, pas de saut de ligne dans le nom |
| Limite de débit | Nginx | 5 envois/min/IP, puis 429 |
| Taille du corps | Nginx | 16 ko au plus |

## Développement local

```bash
cp .env.example .env        # puis remplir
cd backend
deno task test              # 6 tests, sans SMTP réel
deno task dev               # http://localhost:8000
```

## Déploiement sur le VPS

1. DNS chez le registrar : A `@` et `www` → IP du VPS, plus les MX, SPF, DKIM et DMARC fournis par l’hébergeur mail.
2. Répertoire : `sudo mkdir -p /srv/portfolio/frontend && sudo chown -R liutwin:liutwin /srv/portfolio`, y copier le contenu de `frontend/` et `docker-compose.yml`.
3. `.env` : copier `.env.example`, générer `TOKEN_SECRET` avec `openssl rand -hex 32`, renseigner le mot de passe SMTP.
4. Nginx :
   ```bash
   sudo cp nginx/limit-contact.conf /etc/nginx/conf.d/
   sudo cp nginx/liutwin.com /etc/nginx/sites-available/
   sudo ln -s /etc/nginx/sites-available/liutwin.com /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
5. HTTPS : `sudo certbot --nginx -d liutwin.com -d www.liutwin.com`
6. Image : construite et poussée sur ghcr.io par GitHub Actions (même workflow que les autres projets, contexte `./backend`), puis `docker compose pull && docker compose up -d`.
7. Vérifier : `curl https://liutwin.com/api/contact/token` renvoie un jeton, puis envoyer un message depuis le site. Les rejets apparaissent dans `docker compose logs -f` avec le préfixe `[spam]`.
# portfolio

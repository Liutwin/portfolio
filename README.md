# Portfolio liutwin.com

Le site est statique : c’est le Nginx de l’hôte qui le sert. Seul l’endpoint du formulaire de contact tourne dans un conteneur Deno, joignable uniquement en local.

```
navigateur ──HTTPS──▶ Nginx (hôte) ──┬── /            → /srv/portfolio/frontend
                                     └── /api/contact → 127.0.0.1:8010 → conteneur Deno ──SMTP──▶ contact@liutwin.com
```

Le formulaire récupère un jeton via `GET /api/contact/token`, puis envoie le nom, l’adresse de réponse et le message à `POST /api/contact`. L’adresse `contact@liutwin.com` n’apparaît nulle part dans la page.

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
cp .env.example .env        # local uniquement ; en production, le .env est généré par le workflow
cd backend
deno task test              # 6 tests, sans SMTP réel
deno task dev               # site complet + formulaire sur http://localhost:8000
```

En mode `dev`, le backend sert aussi le dossier `frontend/`, comme Nginx en production. Avec les vrais identifiants SMTP dans `.env`, le formulaire envoie de vrais mails ; avec un mot de passe bidon, il répond « L’envoi a échoué », ce qui suffit pour tester le reste.

## Déploiement

Un seul workflow, `.github/workflows/deploy.yml`, déclenché à chaque push sur `main` (ou à la main depuis l’onglet Actions) :

1. **test** : `deno task test` ;
2. **build** : image du backend poussée sur `ghcr.io/liutwin/portfolio-backend` ;
3. **deploy** : copie de `docker-compose.yml`, `rsync` de `frontend/` vers `/srv/portfolio/frontend`, génération du `.env` à partir des secrets, puis `docker compose pull && up -d`.

### Mise en place (une seule fois)

1. **DNS** chez le registrar : A `@` et `www` → IP du VPS, plus les MX, SPF, DKIM et DMARC fournis par l’hébergeur mail.
2. **Répertoire** sur le VPS :
   ```bash
   sudo mkdir -p /srv/portfolio/frontend && sudo chown -R liutwin:liutwin /srv/portfolio
   ```
3. **Nginx** :
   ```bash
   sudo cp nginx/limit-contact.conf /etc/nginx/conf.d/
   sudo cp nginx/liutwin.com /etc/nginx/sites-available/
   sudo ln -s /etc/nginx/sites-available/liutwin.com /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. **HTTPS** : `sudo certbot --nginx -d liutwin.com -d www.liutwin.com`
5. **Secrets GitHub** (*Settings → Secrets and variables → Actions*) :

   | Secret | Valeur |
   |---|---|
   | `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PORT` | mêmes valeurs que pour les autres projets |
   | `TOKEN_SECRET` | sortie de `openssl rand -hex 32` |
   | `SMTP_HOST`, `SMTP_PORT` | `ssl0.ovh.net` et `465` (OVH) |
   | `SMTP_USER`, `SMTP_PASSWORD` | identifiants de `contact@liutwin.com` |
   | `MAIL_TO` | boîte qui reçoit les messages |

   Puis, dans *Settings → Actions → General*, cocher *Read and write permissions*.
6. **Premier déploiement** : pousser, ou lancer le workflow à la main.
7. **Vérifier** : `curl https://liutwin.com/api/contact/token` renvoie un jeton, puis envoyer un message depuis le site. Les rejets apparaissent dans `docker compose logs -f` avec le préfixe `[spam]`, et `sudo ss -tlnp | grep 8010` ne doit montrer que `127.0.0.1`.

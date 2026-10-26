# /etc/nginx/sites-available/liutwin.com
# Certbot ajoutera ensuite le bloc 443 et la redirection HTTP → HTTPS.
server {
    listen 80;
    listen [::]:80;
    server_name liutwin.com www.liutwin.com;

    # Le portfolio est statique : servi directement par le Nginx de l'hôte.
    root /srv/portfolio/frontend;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location = /api/contact {
        limit_req zone=contact burst=2 nodelay;
        limit_req_status 429;
        client_max_body_size 16k;
        limit_except POST { deny all; }

        proxy_pass http://127.0.0.1:8010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location = /api/contact/token {
        limit_req zone=contact_token burst=10 nodelay;
        limit_req_status 429;
        limit_except GET { deny all; }

        proxy_pass http://127.0.0.1:8010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Toute autre route /api/ est fermée.
    location /api/ {
        return 404;
    }
}

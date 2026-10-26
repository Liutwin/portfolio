FROM denoland/deno:2.2.12
WORKDIR /app
COPY deno.json deno.lock main.ts ./
# --frozen : échoue si les dépendances ne correspondent plus au deno.lock
RUN deno cache --frozen main.ts
USER deno
EXPOSE 8000
CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-sys", "--allow-read", "main.ts"]

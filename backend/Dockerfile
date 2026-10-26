FROM denoland/deno:2.2.12
WORKDIR /app
COPY deno.json main.ts ./
RUN deno cache main.ts
USER deno
EXPOSE 8000
CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-sys", "--allow-read", "main.ts"]

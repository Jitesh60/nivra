# Nivra on one VM (Oracle Cloud)

This runs the whole backend on one Linux server with Docker: the API, Postgres/PostGIS, Redis, S3-compatible storage (SeaweedFS), a mail catcher and a small Caddy router. You get an https address the Android app can use.

It suits a **pre-launch test server**:
- SMS codes, push and payments are simulated.
- Emails are caught, not sent.

For the store launch, see [Going live](#going-live) or the managed setup in [DEPLOY.md](DEPLOY.md).

```
phone ──https──▶ Cloudflare tunnel (or your domain) ──▶ Caddy ─┬─▶ API ──▶ Postgres, Redis
                                                               └─▶ storage (/sajha-public-media, /sajha-private-docs)
```

Only Caddy is reachable from outside. The database, Redis and storage have no public ports.

## 1. Create the VM

In the Oracle Cloud console, go to **Compute → Instances → Create instance**:
- **Image:** Canonical Ubuntu 22.04 or 24.04. Oracle Linux works too.
- **Shape:** Ampere A1 (Always Free). 2 OCPU and 12 GB RAM is plenty; 1 OCPU and 6 GB works.
- **Boot volume:** 50 GB or more.
- Add your SSH key and create it. Then connect with `ssh ubuntu@<public-ip>`.

## 2. Deploy

```bash
git clone https://github.com/Jitesh60/nivra.git && cd nivra
scripts/oracle-deploy.sh
```

On the first run, this:
1. Installs Docker if it's missing.
2. Generates secrets into `infra/oracle/.env`. That file stays on the VM and is never committed.
3. Builds the API image. This takes about 5–10 minutes on Ampere.
4. Starts everything and migrates the database.
5. Checks health, then prints the address, for example:

```
Nivra is up.
  API address:   https://calm-river-1234.trycloudflare.com
```

By default it opens a Cloudflare **quick tunnel**. That needs no account and no open ports, but the address **changes whenever the tunnel restarts**, for example after a reboot. Re-run the script to get the new one. For a permanent address, use one of these instead:

### Permanent address, option A: named Cloudflare tunnel (no open ports)

You need a domain on Cloudflare (free plan is fine).
1. In the Cloudflare dashboard, go to **Zero Trust → Networks → Tunnels → Create a tunnel** and choose **Cloudflared**. Name it `nivra` and copy the **token**.
2. Add a **Public hostname**, for example `api.yourdomain.com`, with **Service** `HTTP` and `caddy:80`.
3. On the VM:
   ```bash
   CLOUDFLARE_TUNNEL_TOKEN=<token> PUBLIC_HOST=api.yourdomain.com scripts/oracle-deploy.sh
   ```

### Permanent address, option B: your domain straight at the VM

1. Point an `A` record for `api.yourdomain.com` at the VM's public IP.
2. Open ports **80 and 443**:
   - In the OCI console: **Networking → Virtual cloud networks → your VCN → Security lists → Add ingress rules**, with TCP 80 and TCP 443 from `0.0.0.0/0`.
   - On Ubuntu images, the VM's own firewall too:
     ```bash
     sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```
3. Run:
   ```bash
   DOMAIN=api.yourdomain.com scripts/oracle-deploy.sh
   ```
   Caddy gets the HTTPS certificate automatically.

## 3. Point the app at it

On GitHub, go to **Actions → Build APK → Run workflow**. Set **api_base_url** to the address the script printed, then download and install the `nivra-staging-apk` artifact ([mobile README](../apps/mobile/README.md#get-a-test-apk-no-android-setup-needed)).

**Signing in:** SMS isn't connected yet, so codes are printed in the API log:

```bash
docker compose -f infra/oracle/docker-compose.yml logs api | grep OTP
```

## Everyday commands

Run these from the `nivra` folder.

| What | Command |
|---|---|
| Update to the latest `main` | `git pull && scripts/oracle-deploy.sh` (it remembers the mode and address; to switch, run it again with the new `DOMAIN=…`, `CLOUDFLARE_TUNNEL_TOKEN=… PUBLIC_HOST=…` or `MODE=quick`) |
| Logs | `docker compose -f infra/oracle/docker-compose.yml logs -f api` |
| Status | `docker compose -f infra/oracle/docker-compose.yml ps` |
| First admin (for the admin panel) | `docker compose -f infra/oracle/docker-compose.yml exec api node dist/cli/seed-admin.js --email you@example.com --name "Your Name"` |
| Stop | `docker compose -f infra/oracle/docker-compose.yml --profile quick --profile named down` (data is kept) |

**After a reboot:** Docker brings everything back by itself. In quick-tunnel mode, re-run `scripts/oracle-deploy.sh`, because the address changes.

**Backups:**
- To dump the database:
  ```bash
  docker compose -f infra/oracle/docker-compose.yml exec -T postgres pg_dump -U sajha -Fc sajha > nivra-$(date +%F).dump
  ```
- Copy dumps off the VM. `scripts/restore-drill.sh <dump>` checks that a dump restores cleanly.

## Going live

The server runs with `NODE_ENV=test`, which allows the simulated SMS, push, email and payments. Before real users, put these values in `infra/oracle/.env`, set `NODE_ENV=production`, and re-run the script. The API refuses to start in production until every one of them is set, so nothing is left on a simulator by accident.

| Service | Variables |
|---|---|
| **SMS** | `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID` (after DLT registration) |
| **Push** | `PUSH_PROVIDER=fcm`, `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON` |
| **Email** | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` |
| **Payments** | `PAYMENT_PROVIDER=razorpay` and the three `RAZORPAY_*` keys (webhook: `https://<address>/v1/payments/webhook`) |
| **Documents at rest** | `S3_PRIVATE_SSE`. This needs real S3; SeaweedFS can't provide it. For launch, move storage to AWS S3 as described in [DEPLOY.md](DEPLOY.md). |

## Security notes

- `infra/oracle/.env` and `infra/oracle/s3.json` hold the secrets. They are git-ignored, so keep them on the VM, and back them up somewhere private.
- Only Caddy is reachable from outside. It answers on ports 80/443 in domain mode, and on nothing in tunnel mode, where Cloudflare connects outwards.
- Anyone with a quick-tunnel address can reach the API. That's fine for testing, but use a named tunnel or your domain for anything longer-lived.

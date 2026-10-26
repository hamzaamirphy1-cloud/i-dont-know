# Publish a Vibe96 live demo on Vercel

The code is Vercel-ready. **A live URL does not exist until you deploy it in your Vercel account.** Local tests do not establish that Vercel, managed PostgreSQL or private Blob have been connected.

## Deploy from your repository

1. Sign in at https://vercel.com/new and import `hamzaamirphy1-cloud/i-dont-know`. Choose the **Next.js** framework. The committed `vercel.json` installs development tools required by TypeScript migrations and runs the hosted preparation hook followed by the production build.
2. Connect a **fresh managed PostgreSQL** database, for example Neon from Vercel's Marketplace/Storage integration. Set the provider's complete secure connection string as `DATABASE_URL` in the project's **Production** environment. If the integration supplies another name such as `POSTGRES_URL`, copy that value privately to `DATABASE_URL`. Never paste connection strings in chat or commit them. Use a separate database for previews.
3. Add these Production environment variables before deploying/redeploying:

   | Name                        | Value                                                                                                        |
   | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
   | `DATABASE_URL`              | Managed PostgreSQL connection string, entered privately                                                      |
   | `PREPARE_DATABASE_ON_BUILD` | `true`                                                                                                       |
   | `SEED_DEMO`                 | `true` for the sample catalog and three owner-accessible demo accounts                                       |
   | `SEED_PASSWORD`             | A unique private password, 16–128 characters with at least eight distinct characters and two character types |

   The documented local default password is rejected. Use a **fresh** hosted database; re-seeding never resets passwords in a previously seeded database. Keep the seed password private so public visitors cannot control the admin account. The seed account addresses are in README; use your private password. Public visitors can register their own buyer/builder accounts. Set `SEED_DEMO=false` if you want an empty marketplace instead.

4. Connect a **PRIVATE Vercel Blob** store to the project. Verify it supplies server-only `BLOB_READ_WRITE_TOKEN`. A public Blob store is unsuitable for licensed source archives. Without this integration, browsing and account/database workflows can run, while source upload/download and purchases remain unavailable with explicit messages. Do not set `ARTIFACT_DIR` to `/tmp`: Vercel's filesystem is not durable storage.
5. Deploy, then copy the **Production** domain displayed by Vercel (normally ending in `.vercel.app`). Open that actual domain and verify the sample catalog, registration, builder submission and admin review. That verified domain is your live demo URL for the marketplace submission.

Vercel login, GitHub repository access and any hosting/storage charges must be authorized in your own account. No hosting plan or paid resource is created by this repository alone.

## Origin, cookies and files

Do **not** copy the local `.env` into Vercel. In particular, do not set `APP_URL=http://localhost:3000`. The app derives the exact HTTPS origin from Vercel's provider-owned `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`, using the correct preview hostname for previews. For a custom domain, set `APP_URL` to its exact HTTPS origin without paths. Session cookies are automatically Secure on Vercel.

Source uploads are bounded to **4 MiB on Vercel** to stay below Functions' multipart request limit. Local development still allows 10 MiB. Archives are stored privately in Blob; PostgreSQL stores opaque immutable keys and integrity hashes. Buyers still need a confirmed, correctly signed payment webhook, and owners/admins need review permissions. There are no public archive links. Local filesystem archives are not automatically migrated to Blob: never reuse a database that refers to local archives without migrating its files first.

Build-time migrations are opt-in, idempotent and serialized with an advisory lock; they do not reset accounts or purchases. Enable `PREPARE_DATABASE_ON_BUILD` only for the intended database. Managed PostgreSQL TLS verification is preserved; use your provider's connection string and supported certificate configuration.

## Optional Stripe test mode

Once source storage works, enter `STRIPE_SECRET_KEY` (test key) and `STRIPE_WEBHOOK_SECRET` privately in Vercel. Configure the Stripe test webhook endpoint as:

`https://YOUR-ACTUAL-VERCEL-DOMAIN/api/stripe/webhook`

Use your actual deployed domain. Payments show **Not connected** without keys. Live AI, automatic infrastructure deployment and expert booking remain **Not connected**. Do not advertise those as operational.

## Validation available here

The production build, PostgreSQL workflow tests, hosted configuration tests, private Blob adapter tests and browser smoke tests can be run locally. Blob SDK tests use server-side stubs; they do **not** establish real Vercel Blob connectivity. Actual deployment, hosted database connectivity, Blob writes and Stripe-hosted payment verification require the corresponding integrations in your account.

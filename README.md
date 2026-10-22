# Luzio Garage Trading

Separate local website. The EchoMoto reference project was not changed.

## Start

Requires Node.js 24 or newer. Double-click START-WEBSITE.cmd, or run `npm start` in this folder. Run npm install once to install the email library.

- Website: http://127.0.0.1:4174
- Admin: http://127.0.0.1:4174/admin

On first start, the terminal prints an admin setup code. Enter it on the admin page with your name, email, and a password of at least 12 characters. Verify your email before managing the garage. Existing password-only accounts use the migration option described below. Verification and password reset require SMTP configuration. Login sessions expire after eight hours.

Use the HTTP website, not a file:// tab, for inventory, admin, and inquiry forms. Keep the terminal open while using the site. Stop it with Ctrl+C.

## Features

- Public inventory with search, brand and availability filters, sorting, unit details, and photo placeholders.
- Password-protected admin: add/edit motorcycles, mark available/reserved/sold.
- General, motorcycle, and financing inquiries saved to the admin inbox; follow-up status tracking.
- Monthly payment estimate using the visitor's own inputs and a reducing-balance calculation. This is not a loan approval or official offer. No payments, credit checks, or document uploads are processed.
- Mobile menu, call/text links, an embedded Google Map, directions to the supplied Luzio business listing, and responsive layouts.

No fictional motorcycles are seeded. Add real units through the admin dashboard. Photos, social accounts, opening hours, and actual financing policies can be added later.

## Storage and verification

All units, inquiries, admin credentials, and sessions persist in `data/luzio.sqlite` with SQLite journal files. This folder is excluded from Git and cannot be served by the static server. For a backup, stop the server and copy the entire data folder to a safe location. Inquiries include personal contact information: restrict access to backups and this machine.

Run `npm run check` for syntax checks and `npm test` for backend integration tests using a temporary database. Tests do not change live inventory.

This is a local application bound to 127.0.0.1, not a hosted production service. Other devices cannot access it. Production hosting needs HTTPS, secure cookies, appropriate operational setup, and a host supporting Node.js and persistent SQLite storage. Account verification, invitation, and password reset emails are sent through configured SMTP. Inquiry notifications and SMS are not sent automatically; staff check the inbox and contact customers manually. Business details: 0927 304 6604; 15 Col Martelino St., Heroes Hill, Quezon City, Philippines, 1104.

## Email accounts update

Admin and staff sign in with individual email addresses and passwords. Only verified accounts can manage inventory or inquiries. Only admins can invite users, change another user's role, or deactivate another account. Staff cannot access account management. Invitations let each recipient set their own password; there is no public administrator registration.

Existing password-only administrators are migrated without losing inventory or inquiries. Choose **Use existing password-only account**, sign in with the old password, and add a name and email. Existing sessions are invalidated once during migration. New installations require the terminal setup code, name, email, and password.

Install with npm install. Copy .env.example to .env and set your SMTP host, port, username, password, from address, and PUBLIC_URL. Gmail requires an app password. Restart the server after changing .env. Without SMTP configuration, email workflows show an explicit unavailable message; no verification or reset links are displayed in the UI or logged. Do not put credentials into Git or chat.

Verification links expire after 24 hours. Invitations and password reset links expire after 30 minutes. All are one-time links, stored as hashes. Resetting a password invalidates every login session. Reset requests use a generic response for unknown email addresses. There is no automatic password reset bypass.

After resetting, sign in again. Admins can resend pending staff invitations. Inquiries remain in the garage inbox; account emails do not send customer inquiry notifications.

## Customer accounts

Customers use /account to register, verify their email, sign in, recover their password, and view inquiries submitted while signed in. Registration always creates a customer role; customers cannot edit inventory, see the garage inbox, or manage users. Existing guest inquiries stay unlinked. Verification and password reset emails point customers back to /account. All email workflows require configured SMTP.

## Local testing without email

Set LOCAL_AUTH_TEST=true in .env to register and sign in without verification on loopback requests only. Passwords and role restrictions still apply. This does not mark emails verified in the database. Production (NODE_ENV=production), non-loopback connections, and non-local Host headers cannot use this mode. Set LOCAL_AUTH_TEST=false and configure SMTP before deployment. Email-based invitations and password resets still need SMTP.

## Motorcycle photos

In the motorcycle editor, upload up to 12 PNG/JPEG/WebP photos (8 MB each). Use Make cover to move a photo to position 1, and the arrow buttons to set the order. Save Unit persists the gallery. Removing photos from a listing retains the uploaded files. Files are stored in data/uploads; back up the entire data folder.

## Compression, backups, and conversations

New uploads are automatically oriented, resized to fit 1920×1920 without enlargement, and encoded as WebP at quality 82. Existing images are unchanged.

Signed-in customers and the garage team can reply inside inquiry conversations. Unread badges refresh every 15 seconds while visible; open conversations refresh every 10 seconds. Guest inquiries remain phone follow-ups. Conversations are authorized per inquiry owner.

The server creates an integrity-checked backup on first start and whenever the most recent backup is older than 24 hours. This runs while the server is open and catches up after a restart. Admins can also use Back Up Now. Snapshots are in data/backups/snapshot-*, with SQLite, uploads, static assets, and a SHA-256 manifest. Existing snapshots are retained. Copy this folder to another private drive regularly.

To restore, stop the server, keep a copy of the current data folder, copy snapshot luzio.sqlite into data (remove old WAL/SHM only after shutdown), restore snapshot uploads into data/uploads and assets into project assets, then restart. Never expose backups through a public static host.

## Fresh-clone local testing

Run npm install, then npm run dev. On localhost, non-production runs default to email-free registration and admin setup when LOCAL_AUTH_TEST is unset. No .env is needed for local testing. Use the admin setup code printed in the terminal at /admin. Setting LOCAL_AUTH_TEST=false explicitly restores email verification. NODE_ENV=production always disables the bypass, even if LOCAL_AUTH_TEST=true. SMTP remains required for password reset emails and invitations.

Camera photo uploads support up to 120 megapixels before resizing to 1920 pixels. The 8 MB per-file upload limit is unchanged. Decoder errors are reported separately from the pixel limit.

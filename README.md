# Luzio Garage Trading

Separate local website. The EchoMoto reference project was not changed.

## Start

Requires Node.js 24 or newer. Double-click START-WEBSITE.cmd, or run `npm start` in this folder. No dependency install is needed.

- Website: http://127.0.0.1:4174
- Admin: http://127.0.0.1:4174/admin

On first start, the terminal prints an admin setup code. Enter it on the admin page and create a password of at least 12 characters. The code is only for first setup and changes after restarting an unconfigured server. Passwords are hashed; login sessions expire after eight hours. There is no password reset interface yet: keep your password safe.

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

This is a local application bound to 127.0.0.1, not a hosted production service. Other devices cannot access it. Production hosting needs HTTPS, secure cookies, appropriate operational setup, and a host supporting Node.js and persistent SQLite storage. No email or SMS is automatically sent; admins check the inbox, then contact customers manually. Business details: 0927 304 6604; 15 Col Martelino St., Heroes Hill, Quezon City, Philippines, 1104.

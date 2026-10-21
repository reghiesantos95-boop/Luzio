@echo off
cd /d "%~dp0"
echo Open http://127.0.0.1:4174 for the website.
echo Open http://127.0.0.1:4174/admin for management.
echo On first run, use the setup code printed below to create your admin password.
node server.cjs
pause

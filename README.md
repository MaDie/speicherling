# Speicherling

Speicherling ist ein kleiner Online-USB-Stick für den eigenen Docker-Stack. Eine Instanz hat eine Adresse. Jede Person sieht nur die eigenen Dateien, legt Ordner an, lädt per Ziehen ab und kann einzelne Dateien oder Ordner per Link freigeben.

Neue Konten legt nur ein Admin an. Es gibt kein öffentliches Registrieren.

## Start mit Docker

```bash
cp .env.example .env
```

In `.env` mindestens `ADMIN_EMAIL` und `SESSION_SECRET` setzen. `SESSION_SECRET` braucht mindestens 16 Zeichen, zum Beispiel `openssl rand -hex 24`.

`AUTH_MODE=otp` ist der voreingestellte Weg: Anmeldung nur mit E-Mail und Einmalcode, ohne Passwortfeld. Dafür sind `SMTP_HOST` und `SMTP_FROM` Pflicht. `PUBLIC_URL` ist die merkbare Adresse der Instanz, ohne Slash am Ende. Sie steht in Share-Links und in der Code-Mail.

Wer lieber E-Mail und Passwort will, setzt `AUTH_MODE=password` und ein `ADMIN_PASSWORD` mit mindestens 8 Zeichen. SMTP bleibt dann unbenutzt.

```bash
docker compose up -d --build
```

Im Container hört die App fest auf 8080. Auf dem Host wird `PORT` aus der `.env` veröffentlicht, voreingestellt 8080. Ein Reverse-Proxy (Caddy, Traefik) zeigt die Domain darauf. Speicherling selbst bringt keinen Proxy mit. Hinter HTTPS muss `PUBLIC_URL` mit `https://` beginnen, damit das Sitzungscookie als Secure gesetzt wird.

Daten liegen im Volume `speicherling-data`, im Container unter `/data`: die SQLite-Datei `speicherling.db` und die Dateien unter `files/{userId}/`.

Beim ersten Start mit leerer Datenbank entsteht das Admin-Konto aus `ADMIN_EMAIL`. Im Passwort-Modus zusätzlich aus `ADMIN_PASSWORD`. Spätere Starts ändern dieses Konto nicht.

## Anmeldung

Pro Instanz gibt es genau einen Weg.

- `otp`: E-Mail, dann ein sechsstelliger Code, zehn Minuten gültig, einmalig. Fünf Anforderungen pro E-Mail in zehn Minuten. Die Antwort ist dieselbe, ob die Adresse existiert oder nicht.
- `password`: E-Mail und Passwort. Der Code-Weg existiert dort nicht.

Der andere Weg antwortet mit 404.

## Dateien und Links

Ordner, Hochladen per Button, per Klick auf die Ablagefläche oder per Ablegen, auch ganze Ordner aus dem Dateimanager. Beim Hochladen zeigt ein Balken den Fortschritt. Ein Klick auf PDF, Word (.docx), Excel (.xlsx), Bilder, Text, Audio oder Video zeigt die Datei rechts an, höchstens 50 MB. Eine einzelne Datei darf höchstens `MAX_UPLOAD_MB` groß sein, voreingestellt 200. Größere Dateien werden abgewiesen. Ein Reverse-Proxy davor muss dieselbe Größe durchlassen. Laden, Umbenennen, Löschen. Ordner lassen sich als Zip laden.

„Teilen“ erzeugt höchstens einen Link pro Pfad: `/s/` plus ein langer Zufallswert. Eine Datei bietet nur den Download. Ein Ordner ist eine schreibgeschützte Ansicht mit Unterordnern, Download und Zip. Löschen entfernt den Link. Umbenennen behält die URL, der Pfad am Link wird mitgezogen.

## Verwaltung

Admins sehen „Verwaltung“ und legen Nutzer mit Name und E-Mail an. Ein Startpasswort gibt es nur im Passwort-Modus. „Passwort ändern“ liegt dort im Konto-Menü.

## Oberfläche

Deutsch und Englisch. Die Sprache kommt aus dem Browser, ein Schalter `DE | EN` merkt die Wahl im Browser. Dieselbe Wahl gilt für die öffentliche Seite und für die Sprache der Code-Mail.

Die Versionsnummer steht klein unten auf jeder Seite. Sie kommt aus `package.json`.

## Entwicklung

Node 22.

```bash
npm install
cp .env.example .env
npm run dev
```

Die Oberfläche liegt auf `http://localhost:5173` und spricht die API auf Port 8080 an. `npm run build` und `npm start` starten den gebauten Stand, Oberfläche und API zusammen auf Port 8080.

## Version und Releases

Die Version steht nur in `package.json`. Für ein Release die Nummer erhöhen, committen, ein Tag setzen, das exakt dazu passt, und das Tag pushen:

```bash
git tag v1.1.0
git push origin v1.1.0
```

Der Workflow `.github/workflows/release.yml` prüft, dass das Tag `v1.1.0` zur `package.json` passt, und legt ein GitHub Release an.

## English

Speicherling is a small self-hosted online USB stick. One instance, one address. Each person sees only their own files. An admin creates accounts. There is no public sign-up.

Set `AUTH_MODE=otp` for email plus a one-time code, with no password field. That mode requires `SMTP_HOST` and `SMTP_FROM`. Set `AUTH_MODE=password` for email plus password instead. `PUBLIC_URL` is the address used in share links and login mail.

```bash
cp .env.example .env
docker compose up -d --build
```

Inside the container the app listens on 8080. The host publishes `PORT` from `.env`, 8080 by default. Put your own reverse proxy in front. Data lives in the `speicherling-data` volume. A single file may be up to `MAX_UPLOAD_MB`, 200 by default. The upload shows a progress bar. Clicking the drop area opens the file chooser. PDF, Word (.docx), Excel (.xlsx), images, text, audio and video open in a preview on the right, up to 50 MB.

Share links are `/s/` plus a random token. Files download. Folders open read-only. The UI is German and English. The version shown in the footer is `version` in `package.json`. A git tag `v1.1.0` that matches that version creates a GitHub release.

## Lizenz

MIT. Siehe [LICENSE](LICENSE).

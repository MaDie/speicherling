# Hinweise für Agenten

Speicherling ist eine Instanz, ein Prozess, eine Oberfläche. Node 22, TypeScript, Fastify, Vite und React. SQLite und Dateien liegen unter `DATA_DIR` (im Container `/data`).

## Wo was liegt

- `src/server/config.ts` liest die Umgebung und beendet den Prozess, wenn sie nicht zur `AUTH_MODE` passt.
- `src/server/db.ts` hält Nutzer, Sitzungen, Einmalcodes und Share-Links.
- `src/server/auth.ts` ist der einzige Login. Pro Instanz genau ein Weg.
- `src/server/mail.ts` verschickt den Code. Den Code nicht loggen, Passwörter nicht loggen.
- `src/server/files.ts` prüft Pfade und spricht mit dem Dateisystem.
- `src/server/shares.ts` registriert Datei- und Share-Routen.
- `src/client/` ist die Oberfläche. Texte nur in `src/client/i18n/de.ts` und `src/client/i18n/en.ts`, gleiche Schlüssel.

## Anmeldung

`AUTH_MODE=otp` zeigt nur E-Mail und Code. Kein Passwortfeld, auch nicht beim Anlegen eines Nutzers. SMTP ist Pflicht, sonst startet der Prozess nicht.

`AUTH_MODE=password` zeigt nur E-Mail und Passwort. Die OTP-Routen antworten mit 404. SMTP wird nicht benutzt.

Die Oberfläche fragt `GET /api/auth/options`. Fehler der API sind stabile Codes im Feld `error` und werden im Client übersetzt. Neue Codes in beide Wörterbücher aufnehmen.

Sitzungen sind httpOnly-Cookies, 14 Tage, in SQLite. Der erste Start mit leerer Datenbank legt den Admin aus `ADMIN_EMAIL` an.

## Dateien

Jeder Nutzer hat `files/{userId}/`. Pfade sind relativ, ohne führenden Slash, ohne `.` oder `..`. `resolveInside` bleibt im Nutzerverzeichnis und folgt keinen Symlinks nach draußen.

Öffentliche Links lösen nur den Token auf und bleiben im geteilten Pfad. Pro Pfad ein Link. Löschen entfernt betroffene Links. Umbenennen schreibt den Pfad am Link um, die URL bleibt.

## Version

Die Nummer steht nur in `package.json`. Nicht an einer zweiten Stelle pflegen. Vite setzt `__APP_VERSION__`, der Server liest dieselbe Datei für `GET /api/version`. Ein Git-Tag `vX.Y.Z` muss exakt zu dieser Nummer passen, sonst legt der Release-Workflow kein Release an.

## Oberfläche

Hell, ruhig, große Flächen, wenig Elemente. Deutsch und Englisch. Kein Icon-Paket und keine Markenlogos. Dateitypen kommen aus der Endung in `FileIcon.tsx`, speziellere Typen vor den allgemeinen.

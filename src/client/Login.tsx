import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api, errorText } from "./api";
import { useI18n } from "./i18n";

type Mode = "otp" | "password";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<Mode | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ mode: Mode }>("/api/auth/options")
      .then((result) => setMode(result.mode))
      .catch((reason: unknown) => {
        setError(errorText(t, reason instanceof ApiError ? reason.code : "server_error"));
      });
  }, [t]);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ email, lang }),
      });
      setSent(true);
    } catch (reason) {
      setError(errorText(t, reason instanceof ApiError ? reason.code : "server_error"));
    } finally {
      setBusy(false);
    }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "otp") {
        await api("/api/auth/otp/verify", {
          method: "POST",
          body: JSON.stringify({ email, code }),
        });
      } else {
        await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
      }
      onSuccess();
    } catch (reason) {
      setError(errorText(t, reason instanceof ApiError ? reason.code : "server_error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card login-card" onSubmit={mode === "otp" && !sent ? sendCode : signIn}>
      <h1>Speicherling</h1>
      {mode === null ? <p className="muted">{t("loading")}</p> : null}
      {mode === "otp" ? <p className="lede">{t("loginOtpHint")}</p> : null}
      {mode === "password" ? <p className="lede">{t("loginPasswordHint")}</p> : null}
      {error ? <p className="banner">{error}</p> : null}
      {mode ? (
        <label>
          {t("email")}
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
      ) : null}
      {mode === "password" ? (
        <label>
          {t("password")}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
      ) : null}
      {mode === "otp" && sent ? (
        <>
          <p className="note">{t("codeSent")}</p>
          <label>
            {t("code")}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </label>
        </>
      ) : null}
      {mode === "otp" && !sent ? (
        <button className="primary" type="submit" disabled={busy}>
          {t("sendCode")}
        </button>
      ) : null}
      {mode === "otp" && sent ? (
        <button className="primary" type="submit" disabled={busy}>
          {t("signIn")}
        </button>
      ) : null}
      {mode === "password" ? (
        <button className="primary" type="submit" disabled={busy}>
          {t("signIn")}
        </button>
      ) : null}
      {mode === "otp" && sent ? (
        <button className="text-button" type="button" onClick={sendCode} disabled={busy}>
          {t("sendCode")}
        </button>
      ) : null}
    </form>
  );
}

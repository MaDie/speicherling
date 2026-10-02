import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Admin } from "./Admin";
import { ApiError, api, errorText } from "./api";
import { Files } from "./Files";
import { LangSwitch, useI18n } from "./i18n";
import { Login } from "./Login";
import { useLocation } from "./route";
import { SharePage } from "./Share";

export type Me = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  mode: "otp" | "password";
};

function useVersion(): string {
  const [version, setVersion] = useState(__APP_VERSION__);
  useEffect(() => {
    api<{ version: string }>("/api/version")
      .then((result) => {
        if (result.version) setVersion(result.version);
      })
      .catch(() => undefined);
  }, []);
  return version;
}

function Brand() {
  const { navigate } = useLocation();
  return (
    <button className="brand" type="button" onClick={() => navigate("/")}>
      <span className="mark" aria-hidden="true" />
      Speicherling
    </button>
  );
}

function Frame({ children, header }: { children: ReactNode; header: ReactNode }) {
  const version = useVersion();
  return (
    <div className="page">
      <header className="top">{header}</header>
      <main className="content">{children}</main>
      <p className="version">{version}</p>
    </div>
  );
}

function AccountMenu({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function closeOnOutside(event: PointerEvent) {
      const menu = menuRef.current;
      if (!menu?.open) return;
      if (event.target instanceof Node && menu.contains(event.target)) return;
      menu.open = false;
    }
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, []);

  function changePassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    api("/api/me/password", {
      method: "POST",
      body: JSON.stringify({ current, next }),
    })
      .then(() => {
        setCurrent("");
        setNext("");
        setMessage(t("passwordChanged"));
      })
      .catch((reason: unknown) => {
        setError(errorText(t, reason instanceof ApiError ? reason.code : "server_error"));
      });
  }

  return (
    <details className="account" ref={menuRef}>
      <summary>{me.name}</summary>
      <div className="account-panel">
        {me.mode === "password" ? (
          <form onSubmit={changePassword}>
            <h2>{t("changePassword")}</h2>
            {error ? <p className="banner">{error}</p> : null}
            {message ? <p className="note">{message}</p> : null}
            <label>
              {t("currentPassword")}
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                required
              />
            </label>
            <label>
              {t("newPassword")}
              <input
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                minLength={8}
                required
              />
            </label>
            <button className="primary" type="submit">
              {t("save")}
            </button>
          </form>
        ) : null}
        <button className="ghost" type="button" onClick={onLogout}>
          {t("logout")}
        </button>
      </div>
    </details>
  );
}

function PrivateShell() {
  const { t } = useI18n();
  const { pathname, navigate } = useLocation();
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  function refresh() {
    return api<{ user: Omit<Me, "mode">; mode: Me["mode"] }>("/api/me").then((result) => {
      setMe({ ...result.user, mode: result.mode });
    });
  }

  useEffect(() => {
    refresh().catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (me && me.role !== "admin" && pathname === "/admin") navigate("/");
  }, [me, pathname, navigate]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setMe(null);
    navigate("/");
  }

  if (me === undefined) {
    return (
      <Frame header={<><Brand /><LangSwitch /></>}>
        <p className="muted">{t("loading")}</p>
      </Frame>
    );
  }

  if (!me) {
    return (
      <Frame header={<><Brand /><div className="top-actions"><LangSwitch /></div></>}>
        <div className="login-wrap">
          <Login onSuccess={() => void refresh()} />
        </div>
      </Frame>
    );
  }

  const onAdmin = pathname === "/admin";

  return (
    <Frame
      header={
        <>
          <Brand />
          <nav className="nav">
            <button type="button" aria-current={onAdmin ? undefined : "page"} onClick={() => navigate("/")}>
              {t("files")}
            </button>
            {me.role === "admin" ? (
              <button type="button" aria-current={onAdmin ? "page" : undefined} onClick={() => navigate("/admin")}>
                {t("admin")}
              </button>
            ) : null}
          </nav>
          <div className="top-actions">
            <LangSwitch />
            <AccountMenu me={me} onLogout={() => void logout()} />
          </div>
        </>
      }
    >
      {onAdmin && me.role === "admin" ? <Admin me={me} /> : <Files />}
    </Frame>
  );
}

function Shell() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/s/")) {
    const token = decodeURIComponent(pathname.slice(3).split("/")[0] ?? "");
    return (
      <Frame header={<><Brand /><div className="top-actions"><LangSwitch /></div></>}>
        <SharePage token={token} />
      </Frame>
    );
  }
  return <PrivateShell />;
}

export function App() {
  return <Shell />;
}

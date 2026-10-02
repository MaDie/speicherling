import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api, errorText } from "./api";
import { useI18n } from "./i18n";
import type { Me } from "./App";

type ListedUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
};

export function Admin({ me }: { me: Me }) {
  const { t } = useI18n();
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const result = await api<{ users: ListedUser[] }>("/api/admin/users");
    setUsers(result.users);
  }

  useEffect(() => {
    load().catch((reason: unknown) => {
      setError(errorText(t, reason instanceof ApiError ? reason.code : "server_error"));
    });
  }, [t]);

  function createUser(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body: { name: string; email: string; password?: string } = { name, email };
    if (me.mode === "password") body.password = password;
    api("/api/admin/users", { method: "POST", body: JSON.stringify(body) })
      .then(() => {
        setName("");
        setEmail("");
        setPassword("");
        return load();
      })
      .catch((reason: unknown) => {
        setError(errorText(t, reason instanceof ApiError ? reason.code : "server_error"));
      })
      .finally(() => setBusy(false));
  }

  return (
    <section className="admin-grid">
      <form className="card" onSubmit={createUser}>
        <h2>{t("createUser")}</h2>
        {error ? <p className="banner">{error}</p> : null}
        <label>
          {t("name")}
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          {t("email")}
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        {me.mode === "password" ? (
          <label>
            {t("startPassword")}
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>
        ) : null}
        <button className="primary" type="submit" disabled={busy}>
          {t("create")}
        </button>
      </form>
      <div className="card">
        <h2>{t("users")}</h2>
        <ul className="user-list">
          {users.map((user) => (
            <li key={user.id}>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
              <span className="badge">{user.role === "admin" ? t("roleAdmin") : t("roleUser")}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

import nodemailer, { type Transporter } from "nodemailer";
import type { Config } from "./config.js";

let transport: Transporter | null = null;

function mailer(config: Config): Transporter {
  if (!config.smtp) throw new Error("SMTP ist nicht konfiguriert.");
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
    });
  }
  return transport;
}

export async function sendLoginCode(
  config: Config,
  to: string,
  code: string,
  lang: "de" | "en",
): Promise<void> {
  if (!config.smtp) throw new Error("SMTP ist nicht konfiguriert.");
  const subject = lang === "en" ? "Your Speicherling code" : "Dein Speicherling-Code";
  const text =
    lang === "en"
      ? `Your sign-in code is ${code}.\nIt is valid for 10 minutes.\n\n${config.publicUrl}\n`
      : `Dein Anmeldecode lautet ${code}.\nEr gilt 10 Minuten.\n\n${config.publicUrl}\n`;
  await mailer(config).sendMail({
    from: config.smtp.from,
    to,
    subject,
    text,
  });
}

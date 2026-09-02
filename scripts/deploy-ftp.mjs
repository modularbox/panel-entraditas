#!/usr/bin/env node
/**
 * Despliegue del panel estatico (dist/) a panel.entraditas.com.
 *
 * Este script NO contiene credenciales: las lee de variables de entorno que defines TU en tu
 * propia terminal antes de ejecutarlo. Nadie mas las escribe ni las ve, y no quedan en el repo.
 *
 *   $env:FTP_HOST     = "..."
 *   $env:FTP_USER     = "..."
 *   $env:FTP_PASSWORD = "..."
 *   # Opcionales:
 *   $env:FTP_REMOTE_DIR = "/panel.ENTRADITAS.COM"   # destino; por defecto este mismo
 *   $env:FTP_SECURE     = "true"                    # FTPS explicito (por defecto true)
 *   $env:FTP_PORT       = "21"
 *   $env:FTP_DEBUG      = "1"                       # log completo del protocolo
 *   $env:FTP_TLS_REJECT_UNAUTHORIZED = "false"      # solo si el certificado FTPS no verifica
 *
 * Uso:
 *   npm.cmd run build
 *   npm.cmd run deploy:inspect    # lista el destino, no toca nada
 *   npm.cmd run deploy:upload     # sube dist/
 *
 * OJO: esto habla FTP/FTPS, no SFTP. Si el hosting solo admite SFTP (puerto 22, SSH), este
 * script no sirve y hay que usar un cliente SFTP (WinSCP) o una accion de CI que hable SFTP.
 */
import { Client } from "basic-ftp";
import { existsSync } from "node:fs";

const DEFAULT_REMOTE_DIR = "/panel.ENTRADITAS.COM";

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`\nFalta la variable de entorno ${name}.`);
    console.error("Definela en tu terminal antes de ejecutar este comando. Ejemplo en PowerShell:");
    console.error(`  $env:${name} = "..."`);
    process.exit(1);
  }
  return value.trim();
}

async function connect() {
  const client = new Client(Number(process.env.FTP_TIMEOUT_MS || 15000));
  client.ftp.verbose = process.env.FTP_DEBUG === "1";
  const secure = process.env.FTP_SECURE !== "false";
  await client.access({
    host: requireEnv("FTP_HOST"),
    user: requireEnv("FTP_USER"),
    password: requireEnv("FTP_PASSWORD"),
    port: Number(process.env.FTP_PORT || 21),
    secure,
    secureOptions:
      process.env.FTP_TLS_REJECT_UNAUTHORIZED === "false" ? { rejectUnauthorized: false } : undefined
  });
  return client;
}

function remoteDir() {
  return process.env.FTP_REMOTE_DIR?.trim() || DEFAULT_REMOTE_DIR;
}

async function inspect() {
  const client = await connect();
  try {
    const target = remoteDir();
    console.log(`Destino: ${target}`);
    const list = await client.list(target);
    if (list.length === 0) {
      console.log("(vacio)");
      return;
    }
    for (const entry of list) {
      console.log(`  ${entry.isDirectory ? "[dir] " : "      "}${entry.name}  ${entry.size} bytes`);
    }
  } finally {
    client.close();
  }
}

async function upload() {
  if (!existsSync("dist")) {
    console.error("No existe dist/. Ejecuta primero: npm.cmd run build");
    process.exit(1);
  }
  const client = await connect();
  try {
    const target = remoteDir();
    console.log(`Subiendo dist/ a ${target} ...`);
    client.trackProgress((info) => {
      if (info.name) process.stdout.write(`\r  ${info.name}${" ".repeat(20)}`);
    });
    await client.ensureDir(target);
    await client.clearWorkingDir();
    await client.uploadFromDir("dist");
    client.trackProgress();
    console.log("\nSubida completada.");
  } finally {
    client.close();
  }
}

const command = process.argv[2];
const commands = { inspect, upload };
if (!commands[command]) {
  console.error("Uso: node scripts/deploy-ftp.mjs <inspect|upload>");
  process.exit(1);
}

commands[command]().catch((error) => {
  console.error(`\nFallo el despliegue: ${error.message}`);
  if (/ECONNREFUSED|ETIMEDOUT/.test(String(error.message))) {
    console.error("Revisa host y puerto. Si el servidor solo admite SFTP, este script no sirve.");
  }
  process.exit(1);
});

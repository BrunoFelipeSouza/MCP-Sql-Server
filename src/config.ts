import * as sql from 'mssql';
import * as dotenv from 'dotenv';

dotenv.config();

export interface SqlServerConfig {
  server: string;
  database: string;
  user?: string;
  password?: string;
  port: number;
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
    enableArithAbort: boolean;
    connectTimeout: number;
    requestTimeout: number;
  };
  authentication?: {
    type: 'default' | 'ntlm' | 'azure-active-directory-password' | 'azure-active-directory-access-token' | 'azure-active-directory-msi-vm' | 'azure-active-directory-msi-app-service' | 'azure-active-directory-service-principal-secret';
    options?: {
      userName?: string;
      password?: string;
    };
  };
}

export function getConfig(): SqlServerConfig {
  const server = process.env.SQL_SERVER ?? 'localhost';
  const database = process.env.SQL_DATABASE ?? 'master';
  const port = parseInt(process.env.SQL_PORT ?? '1433', 10);
  const encrypt = process.env.SQL_ENCRYPT === 'true';
  const trustServerCertificate = process.env.SQL_TRUST_SERVER_CERTIFICATE !== 'false';

  const useWindowsAuth = process.env.SQL_WINDOWS_AUTH === 'true';

  if (useWindowsAuth) {
    return {
      server,
      database,
      port,
      options: {
        encrypt,
        trustServerCertificate,
        enableArithAbort: true,
        connectTimeout: 30000,
        requestTimeout: 60000,
      },
      authentication: {
        type: 'ntlm',
        options: {
          userName: process.env.SQL_USER,
          password: process.env.SQL_PASSWORD,
        },
      },
    };
  }

  return {
    server,
    database,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    port,
    options: {
      encrypt,
      trustServerCertificate,
      enableArithAbort: true,
      connectTimeout: 30000,
      requestTimeout: 60000,
    },
  };
}

let pool: sql.ConnectionPool | null = null;

export async function getConnection(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }
  pool = await sql.connect(getConfig() as sql.config);
  return pool;
}

export async function closeConnection(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

export { sql };

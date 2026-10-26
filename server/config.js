import 'dotenv/config';

export const host = process.env.HOST || 'localhost';
export const port = Number(process.env.PORT) || 8080;
export const certTimeoutMs = Number(process.env.CERT_TIMEOUT_MS) || 10000;

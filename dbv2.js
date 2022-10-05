import { config } from 'dotenv';
config();
import uuid from 'uuid';
import { ClickHouse } from 'clickhouse';
import { esc } from './dbv1.js';

const clickhouse_config = {
    basicAuth: {
        username: process.env.CLICKHOUSE_USERNAME,
        password: process.env.CLICKHOUSE_PASSWORD,
    },
    port: 8123,
};
const clickhouse = new ClickHouse(clickhouse_config);
const TABLE_NAME = process.env.AUTH_TABLE;

export async function registerGrafana(ota_name) {
    const token = uuid.v4();
    const query = `INSERT INTO ${TABLE_NAME} (token, ota_name) VALUES ('${token}', '${esc(ota_name)}')`;

    const { r } = await clickhouse.query(query).toPromise();
    return r > 0;
}

export async function unregisterGrafana(ota_name) {
    const query = `ALTER TABLE ${TABLE_NAME} DELETE WHERE ota_name = '${esc(ota_name)}'`;
    const { r } = await clickhouse.query(query).toPromise();
    return r > 0;
}

export async function getGrafanaToken(ota_name) {
    const query = `SELECT token FROM ${TABLE_NAME} WHERE ota_name = '${esc(ota_name)}'`;
    const r = await clickhouse.query(query).toPromise();

    if (r.length === 0) {
        return null;
    }

    return r[0].token;
}

export async function getGrafanaID(ota_name) {
    return getGrafanaToken(ota_name);
}

export async function isGrafanaRegistered(ota_name) {
    const query = `SELECT * FROM ${TABLE_NAME} WHERE ota_name = '${esc(ota_name)}'`;
    const r = await clickhouse.query(query).toPromise();
    return r.length > 0;
}

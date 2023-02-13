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

export async function registerGrafana(username) {
    const token = uuid.v4();
    //const query = `INSERT INTO ${TABLE_NAME} (token, username) VALUES ('${token}', '${esc(username)}')`;
    const query = `INSERT INTO ${TABLE_NAME} (token, username) VALUES ({token:String}, {username:String})`;

    //const { r } = await clickhouse.query(query).toPromise();
    const { r } = await clickhouse.query(query, { params: { token, username } }).toPromise();
    return r > 0;
}

export async function unregisterGrafana(username) {
    //const query = `ALTER TABLE ${TABLE_NAME} DELETE WHERE username = '${esc(username)}'`;
    const query = `ALTER TABLE ${TABLE_NAME} DELETE WHERE username = {user:String}`;
    //const { r } = await clickhouse.query(query).toPromise();
    const { r } = await clickhouse.query(query, { params: { user: username } }).toPromise();
    return r > 0;
}

export async function getGrafanaToken(username) {
    //const query = `SELECT token FROM ${TABLE_NAME} WHERE username = '${esc(username)}'`;
    const query = `SELECT token FROM ${TABLE_NAME} WHERE username={user:String}`;
    //const r = await clickhouse.query(query).toPromise();
    const r = await clickhouse.query(query, { params: { user: username } }).toPromise();

    if (r.length === 0) {
        return null;
    }

    return r[0].token;
}

export async function getGrafanaID(username) {
    return getGrafanaToken(username);
}

export async function isGrafanaRegistered(username) {
    try {
        //const query = `SELECT * FROM ${TABLE_NAME} WHERE username = '${esc(username)}'`;
        const query = `SELECT * FROM ${TABLE_NAME} WHERE username={user:String}`;
        //const r = await clickhouse.query(query).toPromise();
        const r = await clickhouse.query(query, { 
            params: {
                user: username
            }
        }).toPromise();
        return r.length > 0;
    } catch (e) {
        console.error(`isGrafanaRegistered(${username}) failed:`, e);
        return false;
    }
}

const crypto = require('crypto');
require('dotenv').config();
const uuid = require('uuid').v4;

const { ClickHouse } = require('clickhouse');
const clickhouse_config = {
    basicAuth: {
        username: process.env.CLICKHOUSE_USERNAME,
        password: process.env.CLICKHOUSE_PASSWORD,
    },
    port: 8123,
};
const clickhouse = new ClickHouse(clickhouse_config);

function esc(a){
    return a.replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'");
}

class Bobbycar {
    constructor(color, owner, type, features, id, name, ota_name, password) {
        this.color = color;
        this.owner = owner;
        this.type = type;
        this.features = features;
        this.id = id || uuid();
        this.name = name;
        this.ota_name = ota_name;
        this.createdAt = Math.floor(Date.now() / 1000);
        this.password = password;
    }
}

class Anhänger {
    constructor(owner, type, name, id) {
        this.color = null;
        this.owner = owner;
        this.type = type;
        this.features = null;
        this.id = id || uuid();
        this.name = name;
        this.ota_name = null;
        this.createdAt = Math.floor(Date.now() / 1000);
        this.password = null;
    }
}

async function register_user(username, password, type, other_data = {}) {
    // new clickhouse implementation
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    let data = [
        username,
        type,
        salt,
        hash,
        other_data.email,
        other_data.avatar_url,
        other_data.name,
        other_data.token_type,
    ];

    const isAdmin = await clickhouse.query(`SELECT username FROM ${process.env.USER_TABLE} WHERE username = '${esc(username)}' AND isAdmin = true`).toPromise();
    data.push((isAdmin[0] && isAdmin[0].hasOwnProperty('username')) ? isAdmin[0].username === username : false);

    const db_stream = clickhouse.insert(`INSERT INTO ${process.env.USER_TABLE}`).stream();
    await db_stream.writeRow(data);
    await db_stream.end();
}

async function getProfilePictureURL(username) {
    const r = await clickhouse.query(`SELECT avatar_url FROM ${process.env.USER_TABLE} WHERE username = '${esc(username)}'`).toPromise();
    
    if (r.length === 0) {
        return '/img/undraw_profile.svg';
    }
    
    return r[0];
}

async function getUserData(username) {
    // get everything from the user table
    const r = await clickhouse.query(`SELECT * FROM ${process.env.USER_TABLE} WHERE username = '${esc(username)}'`).toPromise();
    return r[0];
}

async function validUsername(username) {
    // old: return Object.keys(getUserJson()).includes(username);
    const r = await clickhouse.query(`SELECT username FROM ${process.env.USER_TABLE} WHERE username = '${esc(username)}'`).toPromise();
    return r.length > 0;
}

async function isPasswordLogin(username) {
    // old: return getUserJson()[username].type === 'password';
    const r = await clickhouse.query(`SELECT type FROM ${process.env.USER_TABLE} WHERE username = '${esc(username)}'`).toPromise();
    if (r.length === 0) {
        return false;
    }

    return r[0].type === 'password';
}

async function getUserType(username) {
    // old: return getUserJson()[username].type;
    const r = await clickhouse.query(`SELECT type FROM ${process.env.USER_TABLE} WHERE username = '${esc(username)}'`).toPromise();
    
    if (r.length === 0) {
        return false;
    }

    return r[0].type;
}

async function verifyPassword(username, password) {
    
    const r = await clickhouse.query(`SELECT salt, hash FROM ${process.env.USER_TABLE} WHERE username = '${esc(username)}'`).toPromise();
    if (r.length === 0) {
        return false;
    }

    const salt = r[0].salt;
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return hash === r[0].hash;
}

async function isAdmin(username) {
    const r = await clickhouse.query(`SELECT username FROM ${process.env.USER_TABLE} WHERE username = '${esc(username)}' AND isAdmin = true`).toPromise();
    return r.length > 0;
}

async function saveBobbycar(bobbycar, username) {
    
    const data = [
        bobbycar.id,
        bobbycar.name,
        bobbycar.color,
        username,
        bobbycar.type,
        bobbycar.ota_name,
        JSON.stringify(bobbycar.features),
        Math.floor(new Date().getTime() / 1000),
        bobbycar.password,
    ];

    const db_stream = clickhouse.insert(`INSERT INTO ${process.env.BOBBY_TABLE}`).stream();
    await db_stream.writeRow(data);
    await db_stream.end();
}

async function getBobbycar(username, id) {
    const r = await clickhouse.query(`SELECT * FROM ${process.env.BOBBY_TABLE} WHERE id = '${esc(id)}' AND owner = '${esc(username)}'`).toPromise();
    if (r.length === 0) {
        return null;
    }
    
    let data = r[0];
    data.features = JSON.parse(data.features);
    return data;
}

async function deleteBobbycar(username, bobbycar) {
    const id = bobbycar.id;

    const grafana_id = await getGrafanaID(bobbycar.ota_name);
    if (grafana_id) {
        await unregisterGrafana(bobbycar.ota_name);
    }

    const r = await clickhouse.query(`ALTER TABLE ${process.env.BOBBY_TABLE} DELETE WHERE id = '${esc(id)}' AND owner = '${esc(username)}'`).toPromise();
    return r.affectedRows > 0;
}

async function getBobbycarID(username, bobbycar_name) {
    const r = await clickhouse.query(`SELECT id FROM ${process.env.BOBBY_TABLE} WHERE name = '${esc(bobbycar_name)}' AND owner = '${esc(username)}'`).toPromise();
    if (r.length === 0) {
        return null;
    }
    return r[0].id;
}

async function replaceBobbycar(username, id, bobbycar) {
    await clickhouse.query(`ALTER TABLE ${process.env.BOBBY_TABLE} DELETE WHERE id = '${esc(id)}' AND owner = '${esc(username)}'`).toPromise();

    const data = [
        bobbycar.id,
        bobbycar.name,
        bobbycar.color,
        username,
        bobbycar.type,
        bobbycar.ota_name,
        JSON.stringify(bobbycar.features),
        Math.floor(new Date().getTime() / 1000),
        bobbycar.password,
    ];

    const db_stream = clickhouse.insert(`INSERT INTO ${process.env.BOBBY_TABLE}`).stream();
    await db_stream.writeRow(data);
    await db_stream.end();
}

async function listBobbycars(username) {
    const r = await clickhouse.query(`SELECT * FROM ${process.env.BOBBY_TABLE} WHERE owner = '${esc(username)}'`).toPromise();
    if (r.length === 0) {
        return [];
    }

    return r;
}

async function getBobbycarAsJson(username, bobbycar_name) {
    const r = await clickhouse.query(`SELECT * FROM ${process.env.BOBBY_TABLE} WHERE name = '${esc(bobbycar_name)}' AND owner = '${esc(username)}'`).toPromise();
    if (r.length === 0) {
        return null;
    }

    let data = r[0];
    data.features = JSON.parse(data.features);
    return data;
}

async function registerGrafana(ota_name) {
    let id = 0;
    let id_query = await clickhouse.query(`SELECT max(id)+1 as id, max(name = '${esc(ota_name)}'? toNullable(${process.env.GRAFANA_TABLE}.id) : null) as duplicate FROM ${process.env.GRAFANA_TABLE}`).toPromise();
    
    if (id_query.length < 1) {
        return false;
    }

    id_query = id_query[0];

    if (id_query.duplicate) {
        return 'duplicate';
    }
    
    const { r } = await clickhouse.query(`INSERT INTO ${process.env.GRAFANA_TABLE} (id, name) VALUES (${id_query.id}, '${esc(ota_name)}')`).toPromise();
    return r > 0;
}

async function isGrafanaRegistered(ota_name) {
    const r = await clickhouse.query(`SELECT * FROM ${process.env.GRAFANA_TABLE} WHERE name = '${esc(ota_name)}'`).toPromise();
    return r.length > 0;
}

async function getGrafanaID(ota_name) {
    const r = await clickhouse.query(`SELECT id FROM ${process.env.GRAFANA_TABLE} WHERE name = '${esc(ota_name)}'`).toPromise();
    if (r.length === 0) {
        return null;
    }
    return r[0].id;
}

async function unregisterGrafana(ota_name) {
    const r = await clickhouse.query(`ALTER TABLE ${process.env.GRAFANA_TABLE} DELETE WHERE name = '${esc(ota_name)}'`).toPromise();
    return r > 0;
}

module.exports = {
    register_user,
    getProfilePictureURL,
    getUserData,
    validUsername,
    isPasswordLogin,
    getUserType,
    verifyPassword,
    registerGrafana,
    isGrafanaRegistered,
    getGrafanaID,
    bobbyDB: {
        saveBobbycar,
        getBobbycar,
        deleteBobbycar,
        getBobbycarID,
        replaceBobbycar,
        listBobbycars,
        getBobbycarAsJson,
    },
    Bobbycar,
    Anhänger,
};

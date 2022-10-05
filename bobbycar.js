// this file handles everything that is for bobbycars
import express from 'express';
import { generateRenderOptions } from './public.js';
import { verify, checkOrigin } from './usermanager.js';
import bodyParser from 'body-parser';
import { bobbyDB, Bobbycar, Anhänger } from './dbv1.js';
import { registerGrafana, isGrafanaRegistered, getGrafanaID } from './dbv2.js';
import axios from 'axios';

const api = express.Router();
const default_router = express.Router();

api.use(bodyParser.json());
api.use(bodyParser.urlencoded({ extended: true }));

async function renderEJS(req, res, next) {
    // check if file contains file extension
    if (req.url.split('.htm')[0].includes('.')) {
        next();
        return;
    }
    
    const options = await generateRenderOptions(req);

    let url = req.url;
    url = url.split('?')[0];
    url = url.substring(0, url.includes('.') ? url.lastIndexOf('.') : url.length);
    const file = 'bobbycars' + url;

    if (file.includes('..')) {
        next();
        return;
    }

    res.render(file, { data: options }, (err, html) => {
        if (err) {
            next()
            return
        }
        res.send(html)
    })
}

// api requests

api.use(verify);

api.get('/:owner/:name/', async (req, res) => {
    const { owner, name } = req.params;

    const username = req.decrypted.username;

    if (username !== owner) {
        res.sendStatus(403);
        return;
    }

    const data = await bobbyDB.getBobbycarAsJson(owner, name);
    if (!data) {
        res.sendStatus(404);
        return;
    }

    res.json(data);
});

api.get('/:owner/:name/delete', async (req, res) => {
    const { owner, name } = req.params;

    const username = req.decrypted.username;

    if (username !== owner) {
        res.sendStatus(403);
        return;
    }

    let id = await bobbyDB.getBobbycarID(owner, name);
    const bobbycar = await bobbyDB.getBobbycar(owner, id);

    if (!id || !bobbycar) {
        res.sendStatus(404);
        return;
    }

    await bobbyDB.deleteBobbycar(owner, bobbycar);

    res.redirect('/');
});

api.get('/:owner/:name/register_grafana', async (req, res) => {
    const { owner, name } = req.params;

    const username = req.decrypted.username;

    if (username !== owner) {
        res.sendStatus(403);
        return;
    }

    const bobbycar = await bobbyDB.getBobbycarAsJson(owner, name);
    const result = await registerGrafana(bobbycar.ota_name);

    if (!result) {
        res.sendStatus(500);
        return;
    }

    if (result === 'duplicate') {
        res.redirect(`https://service.bobbycar.cloud/bobbycars/${owner}/${name}?error=grafana_register_duplicate`);
        return;
    }

    res.redirect(`https://service.bobbycar.cloud/bobbycars/${owner}/${name}?popup=grafana_register_success`);
});

api.get('/:owner/:name/is_online', async (req, res) => {
    const { owner, name } = req.params;

    const username = req.decrypted.username;

    if (username !== owner) {
        res.sendStatus(403);
        return;
    }

    const bobbycar = await bobbyDB.getBobbycarAsJson(owner, name);
    if (!bobbycar) {
        res.sendStatus(404);
        return;
    }

    const result = await axios.get('http://127.0.0.1:42431/listAvailable'); // bobbyWebsocket internal backend
    
    if (!result.status === 200) {
        res.json({ status: 'error', error: 'Internal error' });
        return;
    }

    const bobbycars = result.data;
    let online = false;
    
    for (let i = 0; i < bobbycars.length; i++) {
        if (bobbycars[i].name === bobbycar.ota_name) {
            online = true;
            break;
        }
    }

    res.json({ status: 'success', online });
});

api.use(checkOrigin);

api.post('/new', async (req, res) => {
    const data = req.body;

    if (!req.decrypted) {
        res.sendStatus(401);
        return;
    }

    const username = req.decrypted.username;
    const type = data.type;
    const is_edit = (typeof data['edit-id'] !== 'undefined' && data['edit-id'].length > 0) ? data['edit-id'] : false;

    if (type === 'anhaenger') {
        
        const { name } = data;
        const anhaenger = new Anhänger(username, type, name);

        if (is_edit) {
            anhaenger.id = is_edit;
            await bobbyDB.replaceBobbycar(username, is_edit, anhaenger);
        } else {
            await bobbyDB.saveBobbycar(anhaenger, username);
        }

        res.redirect(`/bobbycars/${username}/${name}`);

    } else if (type === 'bobbycar' || type === 'bobbyquad') {
        const { color, name, ota_name, password } = data;
        
        let features = {}; // anything other than color, type, name

        for (const key in data) {
            if (key === 'color' || key === 'type' || key === 'name' || key === 'password' || key === 'edit-id') {
                continue;
            }
            // try to json parse
            try {
                features[key] = JSON.parse(data[key]);
            } catch (e) {
                features[key] = data[key];
            }
        }

        let bobbycar = new Bobbycar(color, username, type, features, null, name, ota_name, password);

        if (is_edit) {
            bobbycar.id = is_edit;
            await bobbyDB.replaceBobbycar(username, bobbycar.id, bobbycar);
        } else {
            await bobbyDB.saveBobbycar(bobbycar, username);
        }

        res.redirect(`/bobbycars/${username}/${name}`);
    }
});

api.use((req, res, next) => {
    res.sendStatus(404);
});

// html pages

default_router.get('/', (req, res) => {
    res.redirect('/');
});

default_router.get('/show', async (req, res) => {
    const options = await generateRenderOptions(req)
    res.status(404).render('templates/404', { data: options })
});

default_router.use(async (req, res, next) => {
    await renderEJS(req, res, next);
});

default_router.get('/:owner/:name', async (req, res) => {
    const { owner, name } = req.params;

    const username = req.decrypted.username;

    if (username !== owner) {
        res.sendStatus(403);
        return;
    }

    const data = await bobbyDB.getBobbycarAsJson(owner, name);
    if (!data) {
        res.sendStatus(404);
        return;
    }

    const options = await generateRenderOptions(req);
    options.bobbycar = data;
    options.is_grafana_registered = await isGrafanaRegistered(data.ota_name);
    options.grafana_id = await getGrafanaID(data.ota_name);

    res.render('bobbycars/show', { data: options });
});

default_router.get('/:owner/:name/connect', async (req, res) => {
    const { owner, name } = req.params;

    const username = req.decrypted.username;

    if (username !== owner) {
        res.sendStatus(403);
        return;
    }

    const data = await bobbyDB.getBobbycarAsJson(owner, name);
    if (!data) {
        res.sendStatus(404);
        return;
    }

    const options = await generateRenderOptions(req);
    options.bobbycar = data;
    options.is_grafana_registered = await isGrafanaRegistered(data.ota_name);
    options.grafana_id = await getGrafanaID(data.ota_name);

    res.render('bobbycars/connect', { data: options });
});


export {
    default_router,
    api as api_router
};

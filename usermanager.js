import { AES_256_GCM_decrypt, AES_256_GCM_encrypt } from '/usr/share/bobbycar-generic/crypt.cjs';
import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import { github_client_id, github_client_secret, valid_orgs } from './config.js';
import { capitalize } from './utils.js';
import moment from 'moment';
import { register_user, validUsername, getUserType, isPasswordLogin, verifyPassword, getUserData } from './dbv1.js';
import rateLimit from "express-rate-limit";
import dotenv from 'dotenv';
dotenv.config();

export const router = express.Router();
export const authenticated_router = express.Router();

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    message: "Too many requests from this IP, please try again after 15 minutes.",
    legacyHeaders: false,
});

const LOGIN_VALID = 1000 * 60 * 60 * 24 * 30; // 30 days

export function get_token(req) {
    let token = null;
    try {
        token = req.body.auth;
    } catch {}

    try {
        if (!token)
            token = req.headers.authorization;
    } catch {}

    try {
        if (!token)
            token = req.query.auth;
    } catch {}

    try {
        if (!token)
            token = req.cookies.auth;
    } catch {}
    return token;
}

export function verify(req, res, next) {
    const token = get_token(req);

    if (!token) {
        console.log('No token provided');
        res.sendStatus(401);
        return;
    }
    let decryptedData = AES_256_GCM_decrypt(token);
    if (!decryptedData) {
        console.log('Invalid token provided');
        res.sendStatus(401);
        return;
    }

    decryptedData = JSON.parse(decryptedData);
    if (decryptedData.valid_until < Date.now()) {
        console.log('Token expired');
        res.clearCookie('auth');
        res.sendStatus(401);
        return;
    }

    req.decrypted = decryptedData
    next();
}

export function checkOrigin(req, res, next) {
    const origin = req.headers.origin;
    if (origin === "https://service.bobbycar.cloud") {
        next();
    } else {
        res.status(401).json({ error: 'Invalid Origin', origin }); // Unauthorized
    }
}

export function update(req, res, next) {

    const token = get_token(req);

    if (!token) {
        next();
        return;
    }

    let decryptedData = AES_256_GCM_decrypt(token);
    if (!decryptedData) {
        next();
        return;
    }

    decryptedData = JSON.parse(decryptedData);

    if (decryptedData.valid_until < Date.now()) {
        res.clearCookie('auth');
        res.redirect('/login?error=expired');
        return;
    }

    req.decrypted = decryptedData;
    next();
}

export function isLoggedIn(req, res) {
    const token = get_token(req);

    if (!token) {
        return false;
    }

    const decryptedData = AES_256_GCM_decrypt(token);
    if (!decryptedData || decryptedData.valid_until < Date.now()) {
        if (res) {
            res.clearCookie('auth');
            res.redirect('/login');
        }
        return false;
    }

    return true;
}

export async function generateAccountDetails(req, optional_userdata) {

    let decryptedData = AES_256_GCM_decrypt(get_token(req));
    if (!decryptedData) {
        return '<code>No Data available.</code>';
    }

    decryptedData = JSON.parse(decryptedData);

    const data = optional_userdata ? optional_userdata : await getUserData(decryptedData.username);
    let until = new Date(decryptedData.valid_until);
    until = moment(until).format('YYYY-MM-DD HH:mm:ss');

    return data.email ? `
    Account Name: ${decryptedData.username}<br>
    Account Type: ${capitalize(data.type)}<br>
    Account E-Mail: ${data.email}<br>
    Login Valid Until: ${decryptedData.remember ? capitalize(moment(until).fromNow()) : 'End of Session'}<br>
    ` : `
    Account Name: ${decryptedData.username}<br>
    Account Type: ${capitalize(data.type)}<br>
    Login Valid Until: ${decryptedData.remember ? capitalize(moment(until).fromNow()) : 'End of Session'}<br>
    `;
}

export async function handleOauthLogin(access_token, scope, token_type, res) {

    let scopes = scope.split(',');
    const needed_scopes = ['read:user', 'read:org'];
    for (const scope of needed_scopes) {
        if (!scopes.includes(scope)) {
            res.clearCookie('auth');
            res.redirect('/login?error=invalid_scope');
            return;
        }
    }

    // get username
    axios.get('https://api.github.com/user', {
        headers: {
            Authorization: `${token_type} ${access_token}`,
        },
    }).then(async (userData) => {

        axios.get('https://api.github.com/user/orgs', {
            headers: {
                Authorization: `${token_type} ${access_token}`,
            },
        }).then(async (orgsData) => {
            const username = userData.data.login;
            let validOrganisation = false;
            for (let orga in orgsData.data) {
                const org = orgsData.data[orga];
                if (valid_orgs.includes(org.login)) {
                    validOrganisation = true;
                    break;
                }
            }

            if (!validOrganisation) {
                res.redirect(`/login?error=invalid_organisation`);
                return;
            }

            const valid_username = await validUsername(username);
            const is_password_login = await isPasswordLogin(username);

            if (!valid_username || (valid_username && !is_password_login)) {
                await register_user(username, access_token, 'github', {
                    email: userData.data.email,
                    avatar_url: userData.data.avatar_url,
                    name: userData.data.name,
                    scopes,
                    token_type,
                });
            }

            const data = AES_256_GCM_encrypt({
                username,
                type: 'github',
                remember: true,
                access_token,
                valid_until: Date.now() + LOGIN_VALID, // 30 days
            });

            res.cookie('auth', data, {
                httpOnly: true,
                secure: true,
                sameSite: 'strict',
                maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
            });
            
            res.send(`
                <meta http-equiv="refresh" content="0; url=/">
                <a href="/">Click here if you are not redirected.</a>
            `);
            console.log(`${username} logged in with github`);

        }).catch(err => {
            console.log(err);
            res.redirect('/login?error=invalid_credentials');
        });
    }).catch((e) => {
        console.log(e);
        res.redirect('/login?error=invalid_credentials');
    });
}

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));
router.use(limiter);

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    let remember = false;

    if (!username || !password) {
        res.redirect('/login?error=missing_fields');
        return;
    }

    if (!(await validUsername(username))) {
        res.redirect('/login?error=invalid_credentials');
        return;
    }

    const type = await getUserType(username);

    if (type !== 'password') {
        res.redirect(`/login?use=${type}`);
        return;
    }

    if (!(await verifyPassword(username, password))) {
        res.redirect('/login?error=invalid_credentials');
        return;
    }

    if (req.body.hasOwnProperty('remember')) {
        remember = !!req.body.remember;
    }

    const data = AES_256_GCM_encrypt({
        username,
        type: 'password',
        remember,
        valid_until: Date.now() + LOGIN_VALID, // 30 days
    });

    if (remember) {
        res.cookie('auth', data, {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
        });
    } else {
        res.cookie('auth', data, {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            expires: 0,
        });
    }

    console.log(`${req.ip} logged in as ${username} for ${remember ? '30 days' : 'session'}`);
    res.redirect('/');
});

router.all('/logout', (req, res, next) => {
    res.clearCookie('auth');
    res.redirect('/');
});

router.all('/login/github', (req, res, next) => {
    res.redirect(`https://github.com/login/oauth/authorize?client_id=${github_client_id}&scope=read:org,read:user,user:email,public_repo`);
});

router.all('/manage', (req, res, next) => {
    const token = req.cookies.auth;
    if (!token) {
        res.redirect(req.get('referer'));
        return;
    }

    let data = AES_256_GCM_decrypt(token);
    if (!data) {
        res.redirect(req.get('referer'));
        return;
    }

    data = JSON.parse(data);

    if (data.type === 'github') {
        res.redirect(`https://github.com/settings/connections/applications/${github_client_id}`)
        return;
    }
    
    res.redirect(req.get('referer'));
});

router.all('/oauth/login', async (req, res, next) => {
    const code = req.query.code;

    if (!code) {
        res.redirect('/login?error=missing_fields');
        return;
    }

    axios({
        method: 'post',
        url: `https://github.com/login/oauth/access_token?client_id=${github_client_id}&client_secret=${github_client_secret}&code=${code}`,
        headers: {
            accept: 'application/json',
        },
    }).then(async (response) => {
        const { access_token, scope, token_type } = response.data;
        await handleOauthLogin(access_token, scope, token_type, res);
    }).catch(error => {
        console.log(error);
        res.redirect('/login?error=invalid_credentials');
    });
});

router.use('/secure', authenticated_router);

router.use((req, res, next) => {
    res.json(router.stack.map(r => r.route?.path).filter(r => r));
});

authenticated_router.use(verify);

authenticated_router.get('/userInfo', (req, res) => {
    res.json(req.decrypted);
});

authenticated_router.get('/github_token', async (req, res) => {
    const { access_token } = req.decrypted;
    res.json({ access_token });
});

authenticated_router.use((req, res, next) => {
    res.sendStatus(404);
});

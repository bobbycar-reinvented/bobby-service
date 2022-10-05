import express from 'express';
import { isLoggedIn, get_token, generateAccountDetails } from './usermanager.js';
import { capitalize } from './utils.js';
import { AES_256_GCM_decrypt } from '/usr/share/bobbycar-generic/crypt.cjs';
import { renderNavbar } from './navbar.js';
import { getUserData, bobbyDB } from './dbv1.js';

export const router = express.Router();

export const button_array = [
    'Left',
    'Right',
    'Up',
    'Down',
    'Profile0',
    'Profile1',
    'Profile2',
    'Profile3',
    'Left2',
    'Right2',
    'Up2',
    'Down2',
    'Extra1',
    'Extra2',
    'Extra3',
    'Extra4',
];

export function handleAnonymousUser(req, res, next) {
    const loggedIn = isLoggedIn(req, res);
    if ((req.url === '/' || req.url.replace('.html', '') === '/index') && !(req.headers.referer && req.headers.referer.includes('login')) && !loggedIn) {
        res.redirect('/login');
        return;
    } else if (loggedIn && req.url === '/login') {
        res.redirect('/');
        return;
    }
    next();
}

export function getHTMLTitle(req, override) {
    const title = override || (req.url.includes('index') ? 'Home' : req.url.substring(req.url.lastIndexOf('/') + 1).replace('.html', '').split('?')[0])
    return capitalize(decodeURIComponent(title))
}

export function getUsername(req) {
    const decryptedData = AES_256_GCM_decrypt(get_token(req));
    if (!decryptedData) {
        return '';
    }
    return JSON.parse(decryptedData).username;
}

export function getDecryptedData(req) {
    const decryptedData = AES_256_GCM_decrypt(get_token(req));
    if (!decryptedData) {
        return null;
    }
    return JSON.parse(decryptedData);
}

export async function getHTMLProfilePicture(req, optional_userdata) {
    const decryptedData = AES_256_GCM_decrypt(get_token(req));
    if (!decryptedData) {
        return '/img/undraw_profile.svg';
    }

    if (optional_userdata) {
        return optional_userdata.hasOwnProperty('avatar_url') ? optional_userdata.avatar_url : '/img/undraw_profile.svg';
    }
    
    const user_data = await getUserData(JSON.parse(decryptedData).username);
    console.log(user_data)
    if (!user_data.hasOwnProperty('avatar_url')) {
        return '/img/undraw_profile.svg';
    }
    return user_data.avatar_url;
}

export async function getHTMLProfilePictureText(req, optional_userdata) {
    const decryptedData = AES_256_GCM_decrypt(get_token(req));
    if (!decryptedData) {
        return 'You must be logged in to change your profile picture.';
    }

    if (optional_userdata ? optional_userdata.type !== 'password' : (await getUserData(JSON.parse(decryptedData).username)).type !== 'password') {
        return 'The profile picture is taken directly from the login service.';
    } else {
        return 'You cannot change the profile picture. Login via GitHub to set it.';
    }
}

export async function renderEJS(req, res, next) {
    // check if file contains file extension
    if (req.url.split('.htm')[0].includes('.')) {
        next();
        return;
    }
    
    const options = await generateRenderOptions(req);

    let url = req.url;
    url = url.split('?')[0];
    url = url.substring(0, url.includes('.') ? url.lastIndexOf('.') : url.length);
    const file = 'public' + url;

    if (file.includes('..')) {
        next();
        return;
    }

    res.render(file, { data: options }, (err, html) => {
        if (err) {
            next()
            return;
        }
        res.send(html)
    })
}

export async function generateRenderOptions(req) {
    const decryptedData = getDecryptedData(req);
    const username = decryptedData ? decryptedData.username : '';
    const data = await getUserData(username);
    const profile_picture = await getHTMLProfilePicture(req, data);
    const account_details = await generateAccountDetails(req);
    const sidenav = await renderNavbar(req);
    const profile_picture_text = await getHTMLProfilePictureText(req, data);
    const bobbycars = await bobbyDB.listBobbycars(username);
    
    return {
        title: getHTMLTitle(req),
        username,
        profile_picture,
        loggedin: isLoggedIn(req, null),
        sidenav,
        bobbycars,
        getHTMLTitle,
        getHTMLUsername: getUsername,
        profile_picture_text,
        account_details,
        req,
        bobbyDB,
        capitalize,
        userdata: data || {},
        user_type: (data && data.hasOwnProperty('type')) ? capitalize(data.type) : 'Unknown',
        button_array,
        decryptedData,
        accessToken: decryptedData && decryptedData.hasOwnProperty('accessToken') ? decryptedData.accessToken : null,
    };
}

router.use(handleAnonymousUser);

router.use(async (req, res, next) => {
    await renderEJS(req, res, next);
});

export default router;

import { default_router, api_router } from './bobbycar.js';
import { router as qr_api_router } from './qr.js';

router.use('/bobbycars', default_router);
router.use('/api/bobbycars', api_router);
router.use('/api/qr', qr_api_router);

router.use(express.static('views/public'));

const express = require('express')
const router = express.Router()
const { isLoggedIn, get_token, generateAccountDetails } = require('./usermanager')
const { capitalize } = require('./utils')
const { AES_256_GCM_decrypt } = require('/usr/share/bobbycar-generic/crypt')
const { renderNavbar } = require('./navbar')
const { getUserData, bobbyDB } = require('./db');

const button_array = [
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

function handleAnonymousUser(req, res, next) {
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

function getHTMLTitle(req, override) {
    const title = override || (req.url.includes('index') ? 'Home' : req.url.substring(req.url.lastIndexOf('/') + 1).replace('.html', '').split('?')[0])
    return capitalize(decodeURIComponent(title))
}

function getUsername(req) {
    const decryptedData = AES_256_GCM_decrypt(get_token(req));
    if (!decryptedData) {
        return ''
    }
    return JSON.parse(decryptedData).username
}

async function getHTMLProfilePicture(req, optional_userdata) {
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

async function getHTMLProfilePictureText(req, optional_userdata) {
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
    const file = 'public' + url;

    res.render(file, { data: options }, (err, html) => {
        if (err) {
            next()
            return;
        }
        res.send(html)
    })
}

async function generateRenderOptions(req) {
    const username = getUsername(req);
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
    };
}

router.use(handleAnonymousUser);

router.use(async (req, res, next) => {
    await renderEJS(req, res, next);
});

module.exports = { 
    public_router: router,
    getHTMLTitle,
    getHTMLUsername: getUsername,
    getHTMLProfilePicture,
    getHTMLProfilePictureText,
    renderEJS,
    generateRenderOptions,
};

router.use('/bobbycars', require('./bobbycar').default_router);
router.use('/api/bobbycars', require('./bobbycar').api_router);
router.use('/api/qr', require('./qr').api_router);

router.use(express.static('views/public'));

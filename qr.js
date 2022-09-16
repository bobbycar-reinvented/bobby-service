const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    message: "Too many requests from this IP, please try again after 15 minutes.",
    legacyHeaders: false,
});

const files = {};

function handleQr(req, res, next) {
    const { username } = req.params;
    const filepath = path.join(__dirname, 'tmp', username + '.qr');

    if (!fs.existsSync(filepath)) {
        res.sendStatus(404);
        return;
    }

    res.set('Content-Type', 'text/plain');
    res.sendFile(filepath);
    console.log('sent qr for ' + username);
}

function saveQR(username, data) {
    const filepath = path.join(__dirname, 'tmp', username + '.qr');
    files[username] = {
        path: filepath,
        invalid_at: Date.now() + 1000 * 60 * 5, // 5 minutes
    };
    fs.writeFileSync(filepath, data);
    console.log('saved qr for ' + username);
}

function deleteQR(username) {
    const filepath = path.join(__dirname, 'tmp', username + '.qr');
    fs.unlinkSync(filepath);
    delete files[username];
    console.log('deleted qr for ' + username);
}

function cleanTmpDir() {
    const files = fs.readdirSync(path.join(__dirname, 'tmp'), { withFileTypes: true });
    for (const file of files) {
        if (file.name.endsWith('.qr')) {
            fs.unlinkSync(path.join(__dirname, 'tmp', file));
        }
    }
    console.log('cleaned tmp dir');
}

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));
router.use(limiter);

router.get('/:username.qr', handleQr);
router.get('/:username', handleQr);

router.post('/add', (req, res) => {
    if (req.decrypted) {

        const { bobbycar, decodedText } = req.body;

        if (files[bobbycar]) {
            deleteQR(bobbycar);
        }

        saveQR(bobbycar, decodedText);
        res.sendStatus(200);
        return;
    } else {
        res.sendStatus(403);
        return;
    }
});

setInterval(() => {
    const now = Date.now();
    Object.keys(files).forEach(username => {
        if (files[username].invalid_at < now) {
            deleteQR(username);
        }
    });
}, 5000);

cleanTmpDir();

module.exports = {
    api_router: router,
}
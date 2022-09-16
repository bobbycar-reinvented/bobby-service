require('dotenv').config();
const github_client_id = process.env.GITHUB_OAUTH_ID;
const github_client_secret = process.env.GITHUB_OAUTH_SECRET;
const valid_orgs = process.env.VALID_ORGS.split(',');

module.exports = {
    github_client_id,
    github_client_secret,
    valid_orgs,
};

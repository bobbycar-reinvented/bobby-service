function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

function sortBobbycarAlphabetically(a, b) {
    if (a.name < b.name) {
        return -1;
    }
    if (a.name > b.name) {
        return 1;
    }
    return 0;
}

function checkUsername(username) {
    // check for symbols in username (only letters, numbers allowed, dashes and underscores are allowed)
    if (username.match(/[^a-zA-Z0-9-_]/)) {
        return false; // invalid username
    }
    return true; // username is valid
}

module.exports = {
    capitalize,
    sortBobbycarAlphabetically,
    checkUsername,
}
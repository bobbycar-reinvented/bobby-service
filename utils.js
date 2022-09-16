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

module.exports = {
    capitalize,
    sortBobbycarAlphabetically,
}
class Alert {
    constructor(type, title, message, timeout = 5000) {
        this.type = type;
        this.title = title;
        this.message = message;
        this.timeout = timeout;
    }

    init() {
        const alert = document.createElement('div');
        alert.classList.add('alert', 'alert-' + this.type);
        alert.setAttribute('role', 'alert');
        alert.innerHTML = `
        <h4 class="alert-heading">${this.title}</h4>
        <p>${this.message}</p>`;
        return alert;
    }

    show() {
        const alerts = document.getElementById('alerts');
        if (!alerts) {
            console.log('Alerts not supported on this page.');
            return;
        }
        const alert = this.init();
        alerts.appendChild(alert);
        setTimeout(() => {
            alert.style.opacity = 1;
        }, 100);
        
        setTimeout(() => {
            alert.style.opacity = 0;
            setTimeout(() => {
                alerts.removeChild(alert);
            }, 500);
        }, this.timeout);
    }

    static success(title, message, timeout = 5000) {
        const alert = new Alert('success', title, message, timeout);
        alert.show();
    }

    static error(title, message, timeout = 5000) {
        const alert = new Alert('danger', title, message, timeout);
        alert.show();
    }

    static warning(title, message, timeout = 5000) {
        const alert = new Alert('warning', title, message, timeout);
        alert.show();
    }

    static info(title, message, timeout = 5000) {
        const alert = new Alert('info', title, message, timeout);
        alert.show();
    }
}

function getQuery() {
    const query = window.location.search.replace('?', '');
    if (query) {
        const params = query.split('&');
        const queryObj = {};
        params.forEach((param) => {
            const [key, value] = param.split('=');
            queryObj[key] = value;
        });
        return queryObj;
    }
    return {};
}

const errorHandler = (error) => {
    switch (error) {
        case 'invalid_credentials':
            Alert.error('Invalid Credentials', 'Please check your username and password.');
            break;
        case 'invalid_organisation':
            Alert.error('Invalid Organisation', 'Only members of the bobbycar graz organisation may use this service!');
            break;
        case 'invalid_scope':
            Alert.error('Invalid Scope', 'Please check your GitHub token scopes.');
            break;
        case 'expired':
            Alert.error('Expired Login', 'Your Login has expired. Please login again.');
            break;
        case 'grafana_register_duplicate':
            Alert.error('Duplicate Grafana Registration', 'You have already registered this bobbycar.');
            break;
        default:
            console.log('Unknown error:', error);
            Alert.error('Error', 'An unknown error occurred.');
            break;
    }
}

const queryHandler = () => {
    const query = getQuery();
    if (query.error) {
        errorHandler(query.error);
    }

    if (query.use) {
        switch (query.use) {
            case 'password':
                Alert.info('Password Login', 'Please enter your username and password.');
                break;
            case 'github':
                Alert.info('GitHub Login', 'Please click the button below to login with GitHub.');
                break;
            default:
                console.log('Unknown login type:', query.use);
                break;
        }
    }

    if (query.type) {
        const bobbycarType = document.getElementById('bobbycar-type');
        if (bobbycarType) {
            bobbycarType.value = query.type;
            bobbycarTypeHandler(null, query.type);
        }
    }

    if (query.edit) {
        const bobbycar = bobbycars.find((bobbycar) => bobbycar.id === query.edit);
        if (bobbycar) {
            const form = document.getElementById('bobbycar-form');
            if (form) {
                // set form values
                // flags = every key in object 'bobbycar' except 'features'
                let flags = Object.keys(bobbycar).filter((key) => key !== 'features');
                flags.forEach((flag) => {
                    const input = form.querySelector('[name="' + flag + '"]');
                    if (input) {
                        input.value = bobbycar[flag];
                    }
                });

                let features = bobbycar.features; // object
                if (features) {
                    Object.keys(features).forEach((feature) => {
                        const input = form.querySelector('[name="' + feature + '"]');
                        if (input) {
                            console.log(feature)
                            let value = features[feature];
                            try {
                                value = JSON.parse(value);
                            } catch {}

                            if (input.type === 'checkbox') {
                                input.checked = value;
                            }

                            if (input.type === 'text' || input.type === 'number' || input.type === 'textarea' || input.type === 'select-one') {
                                input.value = value;
                            }
                        }
                    });
                }

                bobbycarTypeHandler(null, bobbycar.type);
            }
        } else {
            console.log('Could not find bobbycar:', query.edit);
        }
    }

    window.history.replaceState({}, '', window.location.pathname);
}

const checkSendAllowed = () => {
    const bobbycarType = document.getElementById('bobbycar-type');
    if (!bobbycarType) {
        return false;
    }

    if (bobbycarType.value === '') {
        return false;
    }

    return true;
};

function bobbycarTypeHandler(event, override) {
    const bobbycarType = override || event.target.value;
    if (bobbycarType === 'anhaenger') {
        const anhaenger_hidden = document.getElementsByClassName('anhaenger-hidden');
        for (let i = 0; i < anhaenger_hidden.length; i++) {
            anhaenger_hidden[i].classList.add('d-none');
            if (anhaenger_hidden[i].hasAttribute('required')) {
                anhaenger_hidden[i].classList.add('bobby-required');
                anhaenger_hidden[i].removeAttribute('required');
            }
        }
    } else {
        const anhaenger_hidden = document.getElementsByClassName('anhaenger-hidden');
        for (let i = 0; i < anhaenger_hidden.length; i++) {
            anhaenger_hidden[i].classList.remove('d-none');
            if (anhaenger_hidden[i].classList.contains('bobby-required')) {
                anhaenger_hidden[i].classList.remove('bobby-required');
                anhaenger_hidden[i].setAttribute('required', '');
            }
        }
    }
}

const buildYourBobbycarHandler = () => {
    const bobbycarType = document.getElementById('bobbycar-type');
    if (bobbycarType) {
        bobbycarType.addEventListener('change', bobbycarTypeHandler);
    }

    const form = document.getElementById('bobbycar-form');
    if (form) {
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!checkSendAllowed()) {
                Alert.error('Invalid Selection', 'Please select a bobbycar type.');
                return false;
            }

            const name = document.getElementById('bobby-name').value;
            const used_names = bobbycars.map(x => x.name);
            const edit_element = document.querySelector('[name="edit-id"]');
            const is_edit = (typeof edit_element.value === 'string' && edit_element.value.length > 0);

            if (used_names.includes(name) && !is_edit) {
                Alert.error('Invalid Name', 'Please choose a different name.');
                return false;
            }

            const checkboxen = document.getElementById('bobbycar-form').querySelectorAll('input[type=checkbox]');
            for (let i = 0; i < checkboxen.length; i++) {
                if (checkboxen[i].checked) {
                    const hidden = document.getElementById(checkboxen[i].id + '-hidden');
                    hidden.disabled = true;
                }
            }

            event.target.submit();
        });
    }

    const bobby_checkboxes = document.getElementsByClassName('bobby-checkbox');
    if (bobby_checkboxes) {
        for (let i = 0; i < bobby_checkboxes.length; i++) {
            bobby_checkboxes[i].addEventListener('click', (event) => {
                event.target.value = event.target.checked ? 'true' : 'false';
            });
            bobby_checkboxes[i].value = bobby_checkboxes[i].checked ? 'true' : 'false';
        }
    }
}

const jsOnly = () => {
    const jsOnly = document.getElementsByClassName('js-only');
    for (let i = 0; i < jsOnly.length; i++) {
        let element = jsOnly[i];

        element.classList.add('js-available');

        if (element.hasAttribute('disabled')) {
            element.removeAttribute('disabled');
        }
    }
}

const fixer = () => {
    // time fixer
    const time_elements = document.getElementsByTagName('timefix');
    for (let i = 0; i < time_elements.length; i++) {
        let element = time_elements[i];
        try {
            let date = new Date(parseInt(element.innerHTML) * 1000);
            element.innerHTML = moment(date).format('DD.MM.YYYY HH:mm');
        } catch {}
    }
}

const enhancer = () => {
    let password_visibility_toggler = document.getElementsByClassName('toggle-visibility');
    for (let i = 0; i < password_visibility_toggler.length; i++) {
        let element = password_visibility_toggler[i];
        element.addEventListener('click', (event) => {
            let passwordField = document.getElementById(element.getAttribute('for'));
            if (passwordField.type === 'password') {
                passwordField.type = 'text';
            } else {
                passwordField.type = 'password';
            }
        });
    }

    const save_bobby_password = document.getElementById('save-bobby-password');
    if (save_bobby_password) {
        const for_element = document.getElementById(save_bobby_password.getAttribute('for'));
        save_bobby_password.addEventListener('click', (event) => {
            // save to local storage
            const value = for_element.value;
            localStorage.setItem(`bobbycar_password_${current_bobbycar.ota_name}`, value);
            save_bobby_password.disabled = true;
        });
        for_element.addEventListener('keyup', (event) => {
            save_bobby_password.disabled = (for_element.value.length === 0);
        });
        save_bobby_password.disabled = true;
        for_element.value = localStorage.getItem(`bobbycar_password_${current_bobbycar.ota_name}`);
    }

    const bobby_password_addon = document.getElementById('bobby-password-addon');
    if (bobby_password_addon) {
        bobby_password_addon.addEventListener('keyup', (event) => {
            localStorage.setItem(`bobbycar_password_${current_bobbycar.ota_name}`, bobby_password_addon.value);
        });
    }

    const collapse_toggler = document.querySelectorAll('[data-toggle="collapse"].collapse-toggler');
    for (let i = 0; i < collapse_toggler.length; i++) {
        let element = collapse_toggler[i];
        let icons = element.getElementsByTagName('i');
        if (icons) {
            for (let j = 0; j < icons.length; j++) {
                let icon = icons[j];
                const icon_func = () => {
                    if (!element.classList.contains('collapsed')) {
                        icon.classList.remove('bi-caret-down-fill');
                        icon.classList.add('bi-caret-left-fill');
                    } else {
                        icon.classList.remove('bi-caret-left-fill');
                        icon.classList.add('bi-caret-down-fill');
                    }
                };
                element.addEventListener('click', icon_func);
            }
        }
    }
}

const bobbycar_status_checker = () => {
    const badge = document.getElementById('online-indicator');
    const only_when_online = document.getElementsByClassName('only-when-online');
    if (badge) {
        const is_online_func = () => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `/api/bobbycars/${current_bobbycar.owner}/${current_bobbycar.name}/is_online`, true);
            xhr.onload = () => {
                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);
                    if (data.status === 'success') {
                        if (data.online) {
                            badge.classList.add('badge-success');
                            badge.classList.remove('badge-danger');
                            badge.innerHTML = 'Online';
                            for (let i = 0; i < only_when_online.length; i++) {
                                only_when_online[i].removeAttribute('disabled');
                                only_when_online[i].classList.remove('disabled');
                            }
                        } else {
                            badge.classList.remove('badge-success');
                            badge.classList.add('badge-danger');
                            badge.innerHTML = 'Offline';
                            for (let i = 0; i < only_when_online.length; i++) {
                                only_when_online[i].setAttribute('disabled', '');
                                only_when_online[i].classList.add('disabled');
                            }
                        }
                    } else {
                        Alert.error('Error', data.error);
                    }
                }
            };
            xhr.send();
        };
        is_online_func();
        setInterval(is_online_func, 1000);
    }
}

const loadHandler = () => {
    jsOnly();
    queryHandler();
    buildYourBobbycarHandler();
    fixer();
    enhancer();
    bobbycar_status_checker();
};

window.addEventListener('load', loadHandler);
console.log('main.js loaded');

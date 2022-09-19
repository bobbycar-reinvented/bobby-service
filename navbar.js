const { AES_256_GCM_decrypt } = require('/usr/share/bobbycar-generic/crypt')
const { get_token } = require('./usermanager')
const { sortBobbycarAlphabetically } = require('./utils');

const { bobbyDB } = require('./db');

var id;

async function generateBobbycars(req) {

    let template = '';
    let decryptedData = AES_256_GCM_decrypt(get_token(req));
    if (!decryptedData) {
        return ''
    }

    decryptedData = JSON.parse(decryptedData);

    let bobbycars = await bobbyDB.listBobbycars(decryptedData.username);

    // sort alphabetically by name
    bobbycars = bobbycars.sort(sortBobbycarAlphabetically);

    for (const car of bobbycars) {
        if (car.type !== 'anhaenger') {
            template += `
            <a style="color: ${car.color} !important" class="collapse-item" href="/bobbycars/${car.owner}/${car.name}"><i class="fas fa-fw fa-car"></i>${car.name.replace('_', ' ')}</a>
            `;
        }
    }

    return template;
}

async function generateAnhaenger(req) {

    let template = '';
    let decryptedData = AES_256_GCM_decrypt(get_token(req));
    if (!decryptedData) {
        return ''
    }

    decryptedData = JSON.parse(decryptedData);

    const bobbycars = await bobbyDB.listBobbycars(decryptedData.username);

    // sort alphabetically by name
    bobbycars.sort(sortBobbycarAlphabetically);

    for (const car of bobbycars) {
        if (car.type === 'anhaenger') {
            template += `
            <a style="color: ${car.color} !important" class="collapse-item" href="/bobbycars/${car.owner}/${car.name}"><i class="fas fa-trailer"></i>${car.name.replace('_', ' ')}</a>
            `;
        }
    };

    return template;
}

function generateGrafanaUrl(req) {
    let decryptedData = AES_256_GCM_decrypt(get_token(req));
    if (!decryptedData) {
        return ''
    }

    return `<a class="collapse-item" target="_blank" href="https://grafana.bobbycar.cloud/d/r3_qLmtnk/bobbydashboard-v1-0"><i class="fas fa-fw fa-chart-area"></i>Grafana</a>`;
}

const navbar = {
    elements: [
        {
            url: '/',
            name: 'Home',
            icon: null
        },
        {
            type: 'divider'
        },
        {
            type: 'collapse',
            name: 'Utils',
            subname: 'Cloud Utilities',
            children: [
                {
                    url: '/qr-upload',
                    name: 'QR Upload',
                    icon: 'fa-qrcode'
                },
                {
                    type: 'exec',
                    func: generateGrafanaUrl,
                },
            ],
            icon: 'fa-toolbox'
        },
        {
            name: 'Bobbycars',
            subname: 'Manage Bobbycars',
            type: 'collapse',
            icon: 'fa-car',
            children: [
                {
                    type: 'exec',
                    func: generateBobbycars,
                },
                {
                    url: '/bobbycars/new',
                    name: 'New Bobbycar',
                    icon: 'fa-plus'
                },
                {
                    type: 'divider'
                },
                {
                    type: 'exec',
                    func: generateAnhaenger,
                },
                {
                    url: '/bobbycars/new?type=anhaenger',
                    name: 'New Anhänger',
                    icon: 'fa-plus'
                }
            ],
        },
    ],
    title: 'Bobbycar Graz',
}

async function navitem(url, name, icon) {
    return typeof icon === 'string' ? `
    <li class="nav-item">
        <a class="nav-link" href="${url}">
        <i class="fas fa-fw ${icon}"></i>
        <span>${name || ''}</span></a>
    </li>
    ` : `
    <li class="nav-item">
        <a class="nav-link" href="${url}">
        <span>${name || ''}</span></a>
    </li>
    `;
}

async function heading(name) {
    return `
    <div class="sidebar-heading">
        ${name || ''}
    </div>
    `;
}

async function divider(isDark) {
    // change color of hr
    let classList = isDark ? 'sidebar-divider bg-dark mb-0' : 'sidebar-divider mb-0';
    return `<hr class="${classList}">`;
}

async function collapseItem(name, link, icon) {
    return typeof icon === 'string' ? `
    <a class="collapse-item" href="${link}"><i class="fas fa-fw ${icon}"></i>${name}</a>
    ` : `
    <a class="collapse-item" href="${link}">${name}</a>
    `;
}

async function collapse(name, subname, icon, children, req) {

    let renderedChildren = '';
    for (const child of children) {
        if (child.type === 'divider') {
            renderedChildren += await divider(true);
        } else if (child.type === 'exec') {
            let result = child.func(req);

            if (typeof result !== 'string') {
                result = await result;
            }

            renderedChildren += result;
        } else {
            renderedChildren += await collapseItem(child.name, child.url, child.icon);
        }
    };

    return `
    <li class="nav-item">
        <a class="nav-link collapsed" href="#" data-toggle="collapse" data-target="#collapse${id}"
            aria-expanded="true" aria-controls="collapse${id}">
            <i class="fas fa-fw ${icon}"></i>
            <span>${name || ''}</span>
        </a>
        <div id="collapse${id}" class="collapse" aria-labelledby="heading${id}" data-parent="#accordionSidebar">
            <div class="bg-white py-2 collapse-inner rounded">
                <h6 class="collapse-header">${subname || ''}</h6>
                ${renderedChildren}
            </div>
        </div>
    </li>
    `;
}

async function renderItem(item, req) {
    id++;
    if (item.type === 'divider') {
        return await divider();
    } else if (item.type === 'collapse') {
        return await collapse(item.name, item.subname, item.icon, item.children, req);
    } else if (item.type === 'heading') {
        return await heading(item.name);
    } else if (item.type === 'exec') {
        const result = item.func(req);
        if (typeof result !== 'string') {
            return await result;
        }
        return result;
    } else {
        return await navitem(item.url, item.name, item.icon);
    }
}

async function renderNavbar(req) {
    id = 0;

    const { elements, title } = navbar;

    let html = '';
    
    for (const item of elements) {
        html += await renderItem(item, req);
    }

    return `
    <ul class="navbar-nav bg-gradient-primary sidebar sidebar-dark accordion" id="accordionSidebar">
        <!-- Sidebar - Brand -->
        <a class="sidebar-brand d-flex align-items-center justify-content-center" href="/">
            <div class="sidebar-brand-icon rotate-n-15">
                <i class="fas fa-laugh-wink"></i>
            </div>
            <div class="sidebar-brand-text mx-1">${title}</div>
        </a>

        <!-- Divider -->
        <hr class="sidebar-divider my-0">

        ${html}

        <!-- Divider -->
        <hr class="sidebar-divider d-none d-md-block">

        <!-- Sidebar Toggler (Sidebar) -->
        <div class="text-center d-none d-md-inline">
            <button class="rounded-circle border-0" id="sidebarToggle"></button>
        </div>

    </ul>
    `;
}

module.exports = {
    renderNavbar,
};

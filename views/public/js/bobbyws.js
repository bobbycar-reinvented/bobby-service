let ws;
let loginModal;
let connected_indicator;
let grabbed = false;
let ip_pings = {};

const KEY_DESC_MAPPING = {
    "fls": "Front Left Motor Speed",
    "fla": "Front Left Motor Current",
    "fle": "Front Left Motor Error",
    "frs": "Front Right Motor Speed",
    "fra": "Front Right Motor Current",
    "fre": "Front Right Motor Error",
    "fbv": "Front Voltage",
    "fbt": "Front Temperature",
    "bls": "Back Left Speed",
    "bla": "Back Left Current",
    "ble": "Back Left Error",
    "brs": "Back Right Speed",
    "bra": "Back Right Current",
    "bre": "Back Right Error",
    "bbv": "Back Voltage",
    "bbt": "Back Temperature",
    "pcg": "Gas",
    "pcb": "Brems",
    "prg": "Raw Gas",
    "prb": "Raw Brems",
    "mdr": "Meters driven now",
    "mdt": "Meters driven total",
    "bap": "Battery Percentage",
    "kml": "Calculated Kilometers Left",
    "ekm": "Estimted Kilometers Left",
    "whl": "Wh left",
    "cdt": "Driving Time",
    "loc": "Is locked?",
    "sha": "Git Hash",
    "upt": "Uptime",
    "bav": "Battery Average Voltage",
    "pwr": "Total Power",
    "per": "Driving Mode Performance",
};

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

function isInViewport(element, ignore_x_axis) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        (rect.right <= (window.innerWidth || document.documentElement.clientWidth) || ignore_x_axis)
    );
}

function spinnerHTML(type) {
    switch (type) {
        case 'connecting':
            return `
            <div class="spinner-border text-primary" role="status">
                <span class="sr-only">Connecting...</span>
            </div>
            <span class="text-primary navbar-text ml-2">Connecting...</span>
            `;
        case 'connected':
            return `
            <span class="text-success navbar-text ml-2">Connected!</span>
            `;
        case 'error':
            return `
            <span class="text-danger navbar-text ml-2">Error!</span>
            `;
        case 'idle':
            return `
            <span class="text-muted navbar-text ml-2">Idle!</span>
            `;
        case 'login':
            return `
            <div class="spinner-border text-primary" role="status">
                <span class="sr-only">Logging in...</span>
            </div>
            <span class="text-primary navbar-text ml-2">Logging in...</span>
            `;
        case 'disconnected':
            return `
            <span class="text-danger navbar-text ml-2">Disconnected!</span>
            `;
        case 'loading':
            return `
            <div class="spinner-border text-primary" role="status">
                <span class="sr-only">Loading...</span>
            </div>
            <span class="text-primary navbar-text ml-2">Loading...</span>
            `;
    }
    return '';
}

function generate_input_field(entry) {
    // cpp types to javascript typeof
    let type = entry.type;

    if (type.startsWith('int') || type.startsWith('uint')) {
        type = 'number';
    } else if (type.startsWith('bool')) {
        type = 'boolean';
    }

    if (type.includes('optional') && (typeof entry.value === "undefined" || entry.value === null)) {
        type = 'null';
    } else if (type.includes('optional')) {
        type = type.replace('std::optional<', '');
        type = type.substring(0, type.length - 1);
    }

    if (entry.enum_values)
        type = 'select';

    switch (type) {
        case 'string':
        default:
            return `
            <input type="text" class="form-control nvs-key update-nvs-value" placeholder="${entry.value}" aria-label="${entry.value}" aria-describedby="set-nvs-${entry.name}" value='"${entry.value}"' id="set-nvs-${entry.name}" data-nvs-key="${entry.name}">
            `;
        case 'number':
            return `
            <input type="number" class="form-control nvs-key update-nvs-value" placeholder="${entry.value}" aria-label="${entry.value}" aria-describedby="set-nvs-${entry.name}" value="${entry.value}" id="set-nvs-${entry.name}" data-nvs-key="${entry.name}">
            `;
        case 'boolean':
            return `
            <input type="checkbox" class="form-control nvs-key update-nvs-value" aria-label="${entry.value}" aria-describedby="set-nvs-${entry.name}" id="set-nvs-${entry.name}" ${entry.value ? 'checked' : ''} data-nvs-key="${entry.name}">
            `;
        case 'null':
            return `
            <input type="text" class="form-control nvs-key update-nvs-value" placeholder="${entry.value}" aria-label="${entry.value}" aria-describedby="set-nvs-${entry.name}" value='${entry.value}' id="set-nvs-${entry.name}" data-nvs-key="${entry.name}">
            `;
        case 'select':
        {
            let html = `
            <select class="form-control nvs-key update-nvs-value" aria-label="${entry.value}" aria-describedby="set-nvs-${entry.name}" id="set-nvs-${entry.name}" data-nvs-key="${entry.name}">
            `;
            for (const key in entry.enum_mapping) {
                const val = entry.enum_mapping[key];
                html += `
                <option value="${val}" ${entry.value === val ? 'selected' : ''}>${key}</option>
                `;
            }
            html += `
            </select>
            `;
            return html;
        }
    }
}

function generate_set_html(entry) {
    const html = `
    <div class="input-group mb-3">
        ${generate_input_field(entry)}
        <button class="btn btn-secondary bobby-nvs-set" disabled type="button" id="set-nvs-btn-${entry.name}" for="set-nvs-${entry.name}" data-type="${entry.type}" data-nvs-key="${entry.name}">Set</button>
        <button class="btn btn-secondary bobby-nvs-reset" disabled type="button" id="reset-nvs-btn-${entry.name}" for="set-nvs-${entry.name}" data-type="${entry.type}" data-nvs-key="${entry.name}">Reset</button>
    </div>  
    `;
    return html;
}

function nvs_key_to_html(entry) {
    const tr = document.createElement('tr');
    tr.id = `nvs-key-${entry.name}`;

    const td_name = document.createElement('td');
    td_name.innerText = entry.name;
    tr.appendChild(td_name);

    const td_value = document.createElement('td');
    if (entry.value === '') {
        td_value.innerHTML = `<code>''</code>`;
    } else if (entry.value === null || typeof entry.value === "undefined") {
        td_value.innerHTML = '<code>null</code>';
    } else {
        td_value.innerText = entry.value;
    }
    td_value.classList.add('update-nvs-value');
    td_value.setAttribute('data-nvs-key', entry.name);
    tr.appendChild(td_value);

    const td_default_value = document.createElement('td');
    if (entry.default === '') {
        td_default_value.innerHTML = `<code>''</code>`;
    } else if (entry.default === null || typeof entry.default === "undefined") {
        td_default_value.innerHTML = '<code>null</code>';
    } else {
        td_default_value.innerText = entry.default;
    }
    td_default_value.classList.add('nvs-default-value');
    td_default_value.setAttribute('data-nvs-key', entry.name);
    tr.appendChild(td_default_value);


    const td_type = document.createElement('td');
    td_type.innerText = entry.type;
    tr.appendChild(td_type);

    const td_set = document.createElement('td');
    td_set.innerHTML = generate_set_html(entry);
    tr.appendChild(td_set);

    return tr;
}

function handle_save_nvs_key(event, bobby_ws_instance) {
    const { target } = event;
    const input_field = document.getElementById(target.getAttribute('for'));
    const key = target.dataset.nvsKey;
    let value = null;

    if(input_field.type === 'checkbox') {
        value = JSON.stringify(JSON.parse(input_field.checked));
    } else if (input_field.type === 'number') {
        value = JSON.stringify(JSON.parse(input_field.value));
    } else {
        try {
            value = JSON.parse(input_field.value);
        } catch (e) {
            console.log(e)
            Alert.error('JSON Error', `Could not parse value (${value}) for ${key}`);
            return;
        }
    }
    // bobby_ws_instance.send(JSON.stringify({ type: 'setConfig', nvskey: key, value }));
    bobby_ws_instance.setNVSKey(key, value);
}

function handle_reset_nvs_key(event, bobby_ws_instance) {
    const { target } = event;
    const key = target.dataset.nvsKey;
    bobby_ws_instance.send(JSON.stringify({ type: 'resetConfig', nvskey: key }));
}

function get_nvs_keys_in_viewport() {
    const keys = [];
    const nvs_keys = document.getElementsByClassName('nvs-key');
    const collapsed_element = document.getElementById('collapseNvsTable');

    if (!collapsed_element.classList.contains('show')) {
        return [];
    }

    for (let i = 0; i < nvs_keys.length; i++) {
        const nvs_key = nvs_keys[i];
        if (isInViewport(nvs_key, true)) {
            keys.push(nvs_key.dataset.nvsKey);
        }
    }
    return keys;
}

function update_values_from_nvs(bobby_ws_instance) {
    const keys = get_nvs_keys_in_viewport();
    if (keys.length) {
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            setTimeout(() => {
                bobby_ws_instance.send(JSON.stringify({ type: 'getSingleConfig', nvskey: key }));
            }, i * 20);
        }
    }
}

function generate_enum_mapping(enum_values) {
    let enum_object = {};
    for (let i = 0; i < enum_values.length; i++) {
        enum_object[enum_values[i]] = i;
    }
    return enum_object;
}

function fix_config(config) {
    const new_config = {
        value: config.v,
        default: config.d,
        name: config.n,
        touched: config.t,
        type: config.T,
        force_update: config.hasOwnProperty('f') ? config.f : false,
        enum_values: config.hasOwnProperty('e') ? config.e : null,
        enum_mapping: config.hasOwnProperty('e') ? generate_enum_mapping(config.e) : null,
    }
    return new_config;
}

function set_info_html(info_type, bobbycar) {
    let element = document.querySelector(`[data-info-type="${info_type}"]`);

    if (!element)
        return;

    element = element.getElementsByClassName('card-body')[0]

    switch (info_type) {
        case 'general':
        {
            element.innerHTML = `
                <h5 class="card-title font-weight-bold text-primary">General Information</h5>
                <p class="card-text"><code>${bobbycar.info.uptime_string}</code> (${moment(Date.now() - bobbycar.info.uptime / 1000).fromNow()})</p>
                <p class="card-text">Current Display: <code>${bobbycar.info.display.name ? bobbycar.info.display.name : '&lt;no title&gt;'}</code></p>
                <p class="card-text">Battery: ${typeof bobbycar.info.percentage !== 'undefined' && bobbycar.info.percentage !== null ? bobbycar.info.percentage + '%' : 'Not available'}</p>
                <p class="card-text">Voltage: ${typeof bobbycar.info.voltage !== 'undefined' && bobbycar.info.voltage !== null ? Number(bobbycar.info.voltage).toFixed(2) + 'V' : 'Not available'}</p>
                <p class="card-text">Current: ${typeof bobbycar.info.current !== 'undefined' && bobbycar.info.current !== null ? Number(bobbycar.info.current).toFixed(2) + 'A' : 'Not available'}</p>
                <p class="card-text">Temperature Front: ${bobbycar.info.tempFront ? Number(bobbycar.info.tempFront).toFixed(2) + '°C' : 'Not available'}</p>
                <p class="card-text">Temperature Back: ${bobbycar.info.tempBack ? Number(bobbycar.info.tempBack).toFixed(2) + '°C' : 'Not available'}</p>
                <hr>
                <p class="card-text">Last packet received: ${typeof bobbycar.ping !== 'undefined' ? `${bobbycar.ping}ms ago` : 'Not available'}</p>
            `;
            break;
        }
        case 'ota':
        {
            element.innerHTML = `
                <h5 class="card-title font-weight-bold text-success">OTA Data</h5>
                <p class="card-text">Username: ${bobbycar.nvs && bobbycar.nvs.otaUsername ? bobbycar.nvs.otaUsername : 'Loading...'}</p>
                <p class="card-text">URL: ${bobbycar.nvs && bobbycar.nvs.otaUrl ? bobbycar.nvs.otaUrl : 'Loading...'}</p>
                <p class="card-text">Progress: ${bobbycar.otaStatus && typeof bobbycar.otaStatus.progress !== 'undefined' ? (100 / bobbycar.otaStatus.totalSize * bobbycar.otaStatus.progress).toFixed(2) + '%' : 'Loading...'}</p>
                <p class="card-text">Status: ${bobbycar.otaStatus && bobbycar.otaStatus.status ? bobbycar.otaStatus.status : 'Loading...'}</p>
                <hr>
                <div class="progress">
                    <div class="progress-bar bg-success" role="progressbar" style="width: ${bobbycar.otaStatus && typeof bobbycar.otaStatus.progress !== 'undefined' ? (100 / bobbycar.otaStatus.totalSize * bobbycar.otaStatus.progress).toFixed(2) + '%' : '0%'}" aria-valuenow="${bobbycar.otaStatus && typeof bobbycar.otaStatus.progress !== 'undefined' ? (100 / bobbycar.otaStatus.totalSize * bobbycar.otaStatus.progress).toFixed(2) : '0'}" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
            `;
            break;
        }
        case 'git':
        {
            element.innerHTML = `
            <h5 class="card-title font-weight-bold text-secondary">Git <i class="fab fa-github"></i></h5>
            <p class="card-text">Branch: <code>${bobbycar.info.git.branch}</code></p>
            <p class="card-text">Commit: <code>${bobbycar.info.git.commit}</code></p>
            <hr>
            <a href="//github.com/bobbycar-graz/bobbycar-boardcomputer-firmware/commit/${bobbycar.info.git.commit}" class="btn btn-dark" target="_blank"><i class="fab fa-github"></i> Open Commit</a>
            `;
            break;
        }
        case 'wifiSta':
        {
            let pingable = ip_pings.hasOwnProperty(bobbycar.info.wifi.ip) ? ip_pings[bobbycar.info.wifi.ip] : false;

            if (!ip_pings.hasOwnProperty(bobbycar.info.wifi.ip)) {
                pingIP(bobbycar.info.wifi.ip).then((pingable) => {
                    ip_pings[bobbycar.info.wifi.ip] = pingable;
                }).catch(e => {
                    ip_pings[bobbycar.info.wifi.ip] = false;
                });
            }

            element.innerHTML = `
                <h5 class="card-title font-weight-bold text-danger">Wifi STA</h5>
                <p class="card-text">IP: <code>${bobbycar.info.wifi.ip}</code></p>
                <p class="card-text">Mask: <code>${bobbycar.info.wifi.mask}</code></p>
                <p class="card-text">Gateway: <code>${bobbycar.info.wifi.gw}</code></p>
                <p class="card-text">SSID: <code>${bobbycar.info.wifi.ssid}</code></p>
                <p class="card-text">BSSID: <code>${bobbycar.info.wifi.bssid}</code></p>
                <p class="card-text">Channel: <code>${bobbycar.info.wifi.channel}</code></p>
                <p class="card-text">RSSI: <code>${bobbycar.info.wifi.rssi} dBm</code></p>
                <hr>
                <a href="http://${bobbycar.info.wifi.ip}" class="btn btn-dark ${pingable ? '': 'disabled'}" target="_blank"><i class="fas fa-globe"></i> Open Webinterface${pingable ? '':' (Not pingable)'}</a>
            `;
            break;
        }
        case 'wifiAp':
        {
            if(bobbycar.nvs && bobbycar.nvs.wifiApEnabled) {
                element.innerHTML = `
                    <h5 class="card-title font-weight-bold text-warning">Wifi AP</h5>
                    <p class="card-text">AP enabled</p>
                    <p class="card-text">SSID: <code>${bobbycar.nvs && bobbycar.nvs.wifiApName}</code></p>
                    <p class="card-text">Password: <code>${bobbycar.nvs && bobbycar.nvs.wifiApKey}</code></p>
                    <p class="card-text">IP: <code>${bobbycar.nvs && bobbycar.nvs.wifiApIp}</code></p>
                    <p class="card-text">Channel: <code>${bobbycar.nvs && bobbycar.nvs.wifiApChannel}</code></p>
                    <p class="card-text">Security: <code>${bobbycar.nvs && bobbycar.nvs.wifiApAuthmode}</code></p>
                    <p class="card-text">Hidden: <code>${bobbycar.nvs && bobbycar.nvs.wifiApHidden}</code></p>
                `;
            } else {
                element.innerHTML = `
                    <h5 class="card-title font-weight-bold text-warning">Wifi AP</h5>
                    <p class="card-text">AP disabled</p>
                `;
            }
            break;
        }
    }
}

function generate_initial_info_html(bobbycar, body) {
    let html = '<div class="row" id="info-display">';
    
    html += `
        <div class="col-sm mb-3" data-info-type="general">
            <div class="card border-left-primary shadow">
                <div class="card-body"></div>
            </div>
        </div>
        `;

    html += `
        <div class="col-sm mb-3 ${(bobbycar.otaStatus && bobbycar.nvs) ? '' : 'd-none'}" data-info-type="ota">
            <div class="card border-left-success shadow">
                <div class="card-body"></div>
            </div>
        </div>`;

    html += `
        <div class="col-sm mb-3" data-info-type="git">
            <div class="card border-left-secondary shadow">
                <div class="card-body"></div>
            </div>
        </div>`;

    html += `
        <div class="col-sm mb-3" data-info-type="wifiSta">
            <div class="card border-left-danger shadow">
                <div class="card-body"></div>
            </div>
        </div>`;

    html += `
        <div class="col-sm mb-3 ${(bobbycar.nvs && bobbycar.nvs.wifiApEnabled) ? '' : 'd-none'}" data-info-type="wifiAp">
            <div class="card border-left-warning shadow">
                <div class="card-body"></div>
            </div>
        </div>`;

    html += '</div>';
    body.innerHTML = html;
}

function update_info_html(bobbycar, body, force_update = false) {
    const exists = document.getElementById('info-display');
    if (!exists || force_update) {
        generate_initial_info_html(bobbycar, body);
    } 

    if (exists || force_update) {
        // update all values
        const elements = document.getElementById('info-display').children;
        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            const data_type = element.getAttribute('data-info-type');
            set_info_html(data_type, bobbycar);
        }
    }
}

function generate_json_diff_html(before, after, body) {
    // git diff like output
    let html = '<div class="row">';
    let i = 0;

    for (let key in after) {
        if (before[key] !== after[key]) {
            html += `
                <div class="col-sm mb-3">
                    <div class="card border-left-primary shadow">
                        <div class="card-body">
                            <h5 class="card-title font-weight-bold text-primary">${key}</h5>
                            <p class="card-text">${before[key] ? '<code>' + before[key] + '</code>' : '<code>undefined</code>'}</p>
                            <p class="card-text">${after[key] ? '<code>' + after[key] + '</code>' : '<code>undefined</code>'}</p>
                        </div>
                    </div>
                </div>`;
            i++;

            if (i % 3 === 0) {
                html += '</div><div class="row">';
            }

            if (i >= 9) {
                break;
            }
        } else {
            console.log('Skipping', key);
        }
    }

    html += '</div>';

    body.innerHTML = html;
}

function handle_raw_button(btn) {
    ws.handleRawButton(btn.dataset.btnId);
}

function handle_button(btn) {
    ws.handleButton(btn.dataset.btnId);
}

function handle_display_control(event) {
    event.preventDefault();
    const { key } = event;

    if (key.startsWith('Arrow')) {
        const direction = key.split('Arrow')[1];
        ws.handleButton(button_array.indexOf(direction));
    }
}

class ping {
    constructor(ip, callback) {
        if (!this.inUse) {
            this.status = 'unchecked';
            this.inUse = true;
            this.callback = callback;
            this.ip = ip;
            var _that = this;
            this.img = new Image();
            this.img.onload = () => {
                _that.inUse = false;
                _that.callback('responded');
            };
            this.img.onerror = (e) => {
                if (_that.inUse) {
                    _that.inUse = false;
                    _that.callback('responded', e);
                }
            };
            this.start = new Date().getTime();
            this.img.src = `http://${ip}`;
            this.timer = setTimeout(() => {
                if (_that.inUse) {
                    _that.inUse = false;
                    _that.callback('timeout');
                }
            }, 1500);
        }
    }
}

function pingIP(ip) {
    return new Promise((resolve, reject) => {
        const p = new ping(ip, (status, e) => {
            if (status === 'responded') {
                resolve(true);
            } else if (status === 'timeout') {
                reject(false);
            } else {
                reject(e);
            }
        });
    });
}

function init_display_control_btn() {
    const div = document.getElementById('display-control-button');

    div.addEventListener('click', () => {
        grabbed = !grabbed;
        if (grabbed) {
            document.addEventListener('keydown', handle_display_control);
            div.innerHTML = "Click to disable";
        } else {
            document.removeEventListener('keydown', handle_display_control);
            div.innerHTML = "Click to use keyboard";
        }
    });
}

function formatScreenRes(res) { // widthxheight
    const [width, height] = res.split('x');
    return {
        width: parseInt(width),
        height: parseInt(height)
    };
}

function rgb565to888(rgb) {
    const r = (rgb & 0xF800) >> 11;
    const g = (rgb & 0x07E0) >> 5;
    const b = (rgb & 0x001F);
    return {
        r: r << 3,
        g: g << 2,
        b: b << 3
    };
}

function rgb565to888str(rgb) {
    const { r, g, b } = rgb565to888(rgb);
    return `rgb(${r}, ${g}, ${b})`;
}

function rgbToHex(r, g, b) {
    return ((r << 16) | (g << 8) | b).toString(16);
}

function fillLivedataTable(livedata) {
    const tbody = document.getElementById('display-livedata');

    if (!tbody) {
        return;
    }

    for (const key in livedata) {
        // check if row exists, if not, create it
        const row_id = `livedata-row-${key}`;
        if (!document.getElementById(row_id)) {
            const table_row = document.createElement('tr');
            const td_key = document.createElement('td');
            const td_col = document.createElement('td');
            const td_value = document.createElement('td');

            td_key.innerHTML = key;
            td_col.innerHTML = KEY_DESC_MAPPING[key];
            td_value.innerHTML = livedata[key];

            td_key.style.padding = '0';
            td_col.style.padding = '0';
            td_value.style.padding = '0';

            td_key.id = `${row_id}-key`;
            td_col.id = `${row_id}-col`;
            td_value.id = `${row_id}-value`;
            
            table_row.appendChild(td_key);
            table_row.appendChild(td_col);
            table_row.appendChild(td_value);
            table_row.id = row_id;

            tbody.appendChild(table_row);
        } else {
            const td_key = document.getElementById(`${row_id}-key`);
            const td_col = document.getElementById(`${row_id}-col`);
            const td_value = document.getElementById(`${row_id}-value`);

            td_key.innerHTML = key;
            td_col.innerHTML = KEY_DESC_MAPPING[key] ?? '-';
            td_value.innerHTML = livedata[key];
        }
    }
}

// displays websocket messages on a canvas. ws is the websocket object and required for mouse clicks etc
class RemoteDisplay {
    constructor(element, ws, width, height) {
        this.element = element;
        this.ws = ws;
        this.width = width;
        this.height = height;

        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');
        this.element.appendChild(this.canvas);
    }

    handle_data(datas) {
        console.log('============')
        for (const data of datas) {
            const cmd = data.cmd;
            console.log(data)

            switch (cmd) {
                case 'drawChar':
                    break;
                case 'drawCentreString':
                    break;
                case 'drawCircle':
                    break;
                case 'drawEllipse':
                    break;
                case 'drawFastHLine':
                    break;
                case 'drawFastVLine':
                    break;
                case 'drawLine':
                {
                    const { x1, y1, x2, y2, color } = data;
                    let rgb = rgb565to888str(color);
                    this.ctx.strokeStyle = rgb;
                    this.ctx.beginPath();
                    this.ctx.moveTo(x1, y1);
                    this.ctx.lineTo(x2, y2);
                    this.ctx.stroke();
                    this.ctx.closePath();
                    break;
                }
                case 'drawPixel':
                    break;
                case 'drawRoundRect':
                    break;
                case 'drawRect': // just 1 pixel outline
                {
                    const { x, y, w, h, color } = data;
                    let rgb = rgb565to888str(color);
                    this.ctx.strokeStyle = rgb;
                    this.ctx.strokeRect(x, y, w, h);
                    break;
                }
                case 'drawRightString':
                    break;
                case 'drawString':
                    break;
                case 'drawSunkenRect':
                    break;
                case 'drawTriangle':
                    break;


                case 'fillCircle':
                    break;
                case 'fillEllipse':
                    break;
                case 'fillRect':
                {
                    const { x, y, w, h, color } = data;
                    let rgb = rgb565to888str(color);
                    this.ctx.fillStyle = rgb;
                    this.ctx.fillRect(x, y, w, h);
                    break;
                }
                case 'fillRoundRect':
                    break;
                case 'fillScreen':
                {
                    const { color } = data;
                    this.ctx.fillStyle = rgb565to888str(color);
                    this.ctx.fillRect(0, 0, this.width, this.height);
                    break;
                }
                case 'fillTriangle':
                    break;
                
                default:
                    console.log('Unknown screen command', cmd);
                    break;
            }
        }
    }
}

class BobbyWS {
    constructor(ota_name, debug = false) {
        this.ws = null;
        this.connected = false;
        this.authendicated = false;
        this.bobbycar = null;
        this.ota_name = ota_name;
        this.bobby_password = null;
        this.debugElement = debug ? document.getElementById('messages') : null;
        this.block_send = false;
        this.tmp_config = null;
        this.nvs_body = document.getElementById('display-nvs');
        this.nvs_status_msg = document.getElementById('nvs-loading');
        this.nvs_key_count = null
        this.nvs_progress_bar = document.getElementById('nvs-loading-progress');
        this.nvs_load_timer = null;
        this.begin_config_dump_timeout = 0;
        this.config_dump_timeout = 2;
        this.intervals = [];
        this.info_body = document.getElementById('collapseInfos');
        this.info_status_msg = document.getElementById('info-loading');
        this.info_status_msg.innerHTML = 'Information not loaded';
        this.btn_try_again = document.getElementById('btn-try-again');
        this.import_modal = new bootstrap.Modal(document.getElementById('bobbyImportNvsModal'), {
            backdrop: 'static',
            keyboard: false,
            focus: true
        });
        this.display_element = document.getElementById('display-remote');
        this.remote_display = null;
    }

    log(message) {
        console.log(`[BobbyWS] ${message}`);
    }

    show_element(connected) {
        const elements_connected = document.getElementsByClassName('bobbycar-connected');
        const elements_not_connected = document.getElementsByClassName('bobbycar-not-connected');

        setTimeout(() => {
            for (let i = 0; i < elements_not_connected.length; i++) {
                const element = elements_not_connected[i];
                if (connected) {
                    element.style.opacity = '0';
                    setTimeout(() => {
                        element.style.display = 'none';
                    }, 800);
                } else {
                    element.style.display = 'block';
                    setTimeout(() => {
                        element.style.opacity = '1';
                    }, 10);
                }
            }
        }, connected ? 0 : 1000);
        
        
        setTimeout(() => {
            for (let i = 0; i < elements_connected.length; i++) {
                const element = elements_connected[i];
                if (connected) {
                    element.style.display = 'block';
                    setTimeout(() => {
                        element.style.opacity = '1';
                    }, 10);
                } else {
                    element.style.opacity = '0';
                    setTimeout(() => {
                        element.style.display = 'none';
                    }, 800);
                }
            }
        }, connected ? 1000 : 0);
    }

    _wsOnOpen() {
        this.connected = true;
        this.authendicated = false;
        this.bobbycar = null;
        this.log('WS connected');
        this.login_into_bobbycar();
        connected_indicator.innerHTML = spinnerHTML('login');
    }

    _wsOnMessage(event) {
        const message = event.data;

        if (message instanceof ArrayBuffer || message instanceof Blob) {
            return this._wsOnBinary(event);
        }

        console.debug('ws_rx', message)

        if (this.debugElement) {
            let div = document.createElement('div');
            div.innerHTML = `Client <<< Bobbycar : ${message}`;
            this.debugElement.appendChild(div);
        }

        let msg = JSON.parse(message);
        switch (msg.type) {
            case 'error':
            case 'loginError':
                this.log(msg.error);
                Alert.error('Error', msg.error, 2500);
                connected_indicator.innerHTML = spinnerHTML('connecting');
                this.btn_try_again.disabled = true;
                this.begin_config_dump_timeout = 1000;
                this.config_dump_timeout = 50;
                break;
            case 'login':
                this.bobbycar = {};
                this.bobbycar.name = msg.name;
                this.bobbycar.ip = msg.ip;
                this.bobbycar.res = formatScreenRes(msg.res);
                this.authendicated = true;
                this.nvs_body.innerHTML = '';
                this.nvs_key_count = null
                connected_indicator.innerHTML = spinnerHTML('connected');
                Alert.success('Success!', `Logged in as '${msg.name}'!`, 2500);
                setTimeout(() => {
                    this.begin_config_dump();
                }, this.begin_config_dump_timeout + 100);
                setTimeout(() => {
                    this.getInformation();
                    this.getOtaStatus();
                }, this.begin_config_dump_timeout);
                this.clear_intervals();
                this.show_element(true);
                this.remote_display = new RemoteDisplay(this.display_element, this, this.bobbycar.res.width, this.bobbycar.res.height);

                this.send(JSON.stringify({
                    type: 'initScreen',
                }));
                break;
            case 'disconnect':
                // bobbycar disconnected
                this.ws.reconnectInterval = 5000;
                connected_indicator.innerHTML = spinnerHTML('disconnected');
                this.bobbycar = null;
                this.authendicated = false;
                this.block_send = false;
                this.tmp_config = null;
                this.nvs_status_msg.innerHTML = 'NVS not loaded';
                this.info_status_msg.innerHTML = 'Information not loaded';
                this.nvs_body.innerHTML = '';
                this.nvs_key_count = null;
                this.nvs_load_timer = null;
                this.clear_intervals();
                this.begin_config_dump_timeout = 1000;
                this.config_dump_timeout = 50;
                this.show_element(false);
                this.btn_try_again.disabled = false;
                break;
            case 'config':
            {
                if (!this.tmp_config)
                    this.tmp_config = {};
                let counter = ((this.tmp_config ? this.tmp_config.length : 0) || 0);
                msg.configs.forEach(config => {
                    config = fix_config(config);
                    config._id = counter;
                    counter++;
                    this.tmp_config.push(config);
                    this.nvs_body.appendChild(nvs_key_to_html(config));
                    this.nvs_status_msg.innerHTML = `NVS Loading... (${this.tmp_config.length}/${this.nvs_key_count || '?'})`;
                    this.nvs_progress_bar.children[0].children[0].style.width = `${(this.tmp_config.length / this.nvs_key_count) * 100}%`;
                });
                const send_msg = { type: "getConfig", id: this.tmp_config.length };
                setTimeout(() => {
                    this.send(JSON.stringify(send_msg));
                }, this.config_dump_timeout);
                break;
            }
            case 'lastConfig':
            {
                let counter = this.tmp_config.length || 0;
                msg.configs.forEach(config => {
                    config = fix_config(config);
                    config._id = counter;
                    counter++;
                    this.tmp_config.push(config);
                    this.nvs_body.appendChild(nvs_key_to_html(config));
                });
                this.bobbycar.config = this.tmp_config;
                this.bobbycar.nvs = {};
                this.bobbycar.nvs_index_map = {};

                for (let i = 0; i < this.tmp_config.length; i++) {
                    const config = this.tmp_config[i];
                    this.bobbycar.nvs[config.name] = config.value;
                    this.bobbycar.nvs_index_map[config.name] = config._id;
                }

                this.tmp_config = null;
                this.block_send = false;
                // something like 20.1s
                this.nvs_status_msg.innerHTML = `NVS (${this.nvs_key_count} configs in ${((Date.now() - this.nvs_load_timer) / 1000).toFixed(1)}s)`;
                this.nvs_progress_bar.innerHTML = '';
                Alert.success('Success!', 'NVS loaded!', 2500);
                const save_buttons = document.getElementsByClassName('bobby-nvs-set');
                for (let i = 0; i < save_buttons.length; i++) {
                    const btn = save_buttons[i];
                    btn.disabled = false;
                    btn.classList.remove('btn-secondary');
                    btn.classList.add('btn-success');
                    btn.onclick = (e) => {
                        handle_save_nvs_key(e, this);
                    }
                }

                const reset_buttons = document.getElementsByClassName('bobby-nvs-reset');
                for (let i = 0; i < reset_buttons.length; i++) {
                    const btn = reset_buttons[i];
                    const nvs_key = btn.getAttribute('data-nvs-key');
                    const config = this.bobbycar.config.find(c => c.name === nvs_key);
                    btn.disabled = !config.touched;
                    if (config.touched) {
                        btn.classList.remove('btn-secondary');
                        btn.classList.add('btn-danger');
                    }
                    btn.onclick = (e) => {
                        handle_reset_nvs_key(e, this);
                    }
                }

                this.intervals.push(setInterval(() => {
                    update_values_from_nvs(this);
                    this.getUptime();
                    setTimeout(() => {
                        this.getUptime();
                    }, 1250 / 2);
                }, 1250));
                this.intervals.push(setInterval(() => {
                    this.getInformation();
                }, 2000));
                this.intervals.push(setInterval(() => {
                    this.getOtaStatus();
                }, 5000));
                this.config_dump_timeout = 2;
                this.begin_config_dump_timeout = 0;

                const enable_when_nvs_loaded = document.getElementsByClassName('enable-nvs-loaded');
                for (let i = 0; i < enable_when_nvs_loaded.length; i++) {
                    const el = enable_when_nvs_loaded[i];
                    el.disabled = false;
                }

                update_info_html(this.bobbycar, this.info_body, true);
                break;
            }
            case 'configCount':
                this.nvs_key_count = msg.count;
                break;
            case 'singleConfig':
            {
                const config = fix_config(msg.config); 
                const nvs_key = config.name;
                const value = config.value;
                const touched = config.touched;
                const force_update = config.force_update;

                const reset_button = document.querySelector(`[data-nvs-key="${nvs_key}"].bobby-nvs-reset`);
                if (reset_button) {
                    reset_button.disabled = !touched;
                    if (touched) {
                        reset_button.classList.remove('btn-secondary');
                        reset_button.classList.add('btn-danger');
                    } else {
                        reset_button.classList.remove('btn-danger');
                        reset_button.classList.add('btn-secondary');
                    }
                }

                if ((!this.bobbycar || !this.bobbycar.nvs || typeof this.bobbycar.nvs[nvs_key] === 'undefined') && !force_update) {
                    console.log(`nvs key "${nvs_key}" not found, skipping`);
                    break;
                }

                if (this.bobbycar.nvs[nvs_key] !== value || force_update) {
                    const elements = document.querySelectorAll(`[data-nvs-key="${nvs_key}"].update-nvs-value`);
                    
                    for (let i = 0; i < elements.length; i++) {
                        const element = elements[i];
                        if (element.tagName === 'INPUT') {
                            if (element.type === 'checkbox') {
                                element.checked = value;
                            } else {
                                if (element.type === 'text') {
                                    element.value = `"${value}"`;
                                }
                            }
                        } else if(element.tagName === 'SELECT') {
                            const new_html = generate_input_field(config);
                            element.outerHTML = new_html;
                        } else {
                            if (value === '') {
                                element.innerHTML = `<code>''</code>`;
                            } else if (value === null || typeof value === "undefined") {
                                element.innerHTML = '<code>null</code>';
                            } else {
                                element.innerText = value;
                            }
                        }
                    }

                    this.bobbycar.nvs[nvs_key] = value;
                    this.bobbycar.config[this.bobbycar.nvs_index_map[nvs_key]].value = value;
                }
                break;
            }
            case 'info':
                if (!this.bobbycar) {
                    this.bobbycar = {};
                }
                this.bobbycar.info = msg.info;
                this.bobbycar.info.uptime_string = this._format_millis();
                update_info_html(this.bobbycar, this.info_body);
                this.info_status_msg.innerHTML = 'Information';
                break;
            case 'uptime':
                if (!this.bobbycar)
                    break;

                if (!this.bobbycar.info) {
                    this.bobbycar.info = {};
                }
                this.bobbycar.info.uptime = msg.info;
                this.bobbycar.info.uptime_string = this._format_millis();
                update_info_html(this.bobbycar, this.info_body);
                break;
            case 'bobbycar-ping':
                if (!this.bobbycar)
                    break;

                this.bobbycar.ping = msg.time;
                break;
            case 'otaStatus':
                if (!this.bobbycar)
                    break;

                this.bobbycar.otaStatus = msg.info;
                update_info_html(this.bobbycar, this.info_body);
                break;
            case 'screenCtrl':
                if (!this.bobbycar)
                    break;

                this.remote_display.handle_data(msg.data);
                break;
            case 'udpmessage':
                fillLivedataTable(msg.data);
                break;
            default:
                this.log(`Unknown message type: ${msg.type}`);
        }
    }

    _wsOnError(event) {
        this.connected = false;
        this.authendicated = false;
        this.bobbycar = null;
        this.log('WS error', event);
        connected_indicator.innerHTML = spinnerHTML('error');
        this.clear_intervals();
        this.show_element(false);
        this.btn_try_again.disabled = false;
    }

    _wsOnBinary(event) {
        this.log('WS binary', event);
    }

    clear_intervals() {
        this.intervals.forEach(interval => {
            clearInterval(interval);
        });
    }

    connect() {
        if (this.connected || this.ws) {
            return;
        }

        this.ws = new ReconnectingWebSocket(`wss://api.bobbycar.cloud/ws`, null, {
            automaticOpen: true,
            reconnectInterval: 200,
        });

        this.ws.onopen = this._wsOnOpen.bind(this);
        this.ws.onmessage = this._wsOnMessage.bind(this);
        this.ws.onerror = this._wsOnError.bind(this);
        this.ws.binaryType = 'arraybuffer';
        connected_indicator.innerHTML = spinnerHTML('connecting');
        this.btn_try_again.disabled = true;

        this.intervals.push(this.reauth_interval = setInterval(() => {
            if (this.connected && !this.authendicated) {
                this.login_into_bobbycar();
            }
        }, 3000));
    }

    disconnect() {
        if (!this.connected) {
            return;
        }

        this.ws.close();
        this.ws = null;
        this.connected = false;
        this.authendicated = false;
        this.bobbycar = null;
        this.block_send = false;
        this.tmp_config = null;
        this.nvs_body.innerHTML = '';
        this.nvs_key_count = null
        connected_indicator.innerHTML = spinnerHTML('disconnected');
        this.btn_try_again.disabled = false;
        this.clear_intervals();
    }

    login_into_bobbycar() {
        if (!this.bobby_password || !this.ota_name) {
            return;
        }

        this.nvs_key_count = null;

        const msg = { type: "login", user: this.ota_name, pass: this.bobby_password };
        this.send(JSON.stringify(msg));
    }

    send(message) {
        if (!this.connected) {
            console.log('[BobbyWS] Not connected');
            return;
        }

        if (this.debugElement) {
            let div = document.createElement('div');
            div.innerHTML = `Client >>> Bobbycar : ${message}`;
            this.debugElement.appendChild(div);
        }

        this.ws.send(message);
        console.debug('ws_tx', message)
    }

    sendPopup(message) {
        if (!this.connected) {
            console.log('[BobbyWS] Not connected');
            return;
        }

        if (this.block_send)
            return;

        const msg = { type: "popup", msg: message };  
        this.send(JSON.stringify(msg));      
    }

    loadPassword() {
        // load password from local storage
        const password = localStorage.getItem(`bobbycar_password_${this.ota_name}`);
        if (password) {
            this.bobby_password = password;
            return true;
        }
        return false;
    }

    savePassword(password) {
        localStorage.setItem(`bobbycar_password_${this.ota_name}`, password);
        this.loadPassword();
    }

    begin_config_dump() {
        if (!this.connected) {
            console.log('[BobbyWS] Not connected');
            return;
        }

        if (this.block_send)
            return;

        this.block_send = true;
        this.tmp_config = [];
        this.nvs_body.innerHTML = ''
        this.nvs_progress_bar.innerHTML = `
        <div class="progress">
            <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%"></div>
        </div>
        `;
        this.nvs_status_msg.innerHTML = 'NVS Loading... (0/?)';
        const msg = { type: "getConfig", id: 0 };
        this.send(JSON.stringify(msg));
        this.nvs_load_timer = Date.now();
    }

    getInformation() {
        if (!this.connected) {
            console.log('[BobbyWS] Not connected');
            return;
        }

        if (this.block_send)
            return;

        const msg = { type: "getInformation" };
        this.send(JSON.stringify(msg));
    }

    getUptime() {
        if (!this.connected) {
            console.log('[BobbyWS] Not connected');
            return;
        }

        if (this.block_send)
            return;

        const msg = { type: "getUptime" };
        this.send(JSON.stringify(msg));
    }

    getOtaStatus() {
        if (!this.connected) {
            console.log('[BobbyWS] Not connected');
            return;
        }

        if (this.block_send)
            return;

        const msg = { type: "getOtaStatus" };
        this.send(JSON.stringify(msg));
    }

    _format_millis() {
        return moment.utc(this.bobbycar.info.uptime / 1000).format('HH:mm:ss');
    }

    download_nvs() {
        if (!this.connected) {
            console.log('[BobbyWS] Not connected');
            return;
        }

        if (!this.bobbycar.nvs) {
            console.log('[BobbyWS] No NVS to download');
            return;
        }

        const blob = new Blob([JSON.stringify(this.bobbycar.nvs)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'nvs.json';
        link.click();
        window.URL.revokeObjectURL(url);
    }

    import_nvs() {
        if (!this.connected) {
            console.log('[BobbyWS] Not connected');
            return;
        }

        if (!this.bobbycar.nvs) {
            console.log('[BobbyWS] No NVS to download');
            return;
        }

        this.import_modal.show();
    }

    import_nvs_file(file) {
        console.log(file);
        // deny if not json
        if (file.type !== 'application/json') {
            Alert.error('Invalid file type', `Please select a JSON file (type: ${file.type})`);
            return;
        }

        // read file and try to parse, if fails, show error
        const reader = new FileReader();
        reader.onload = (e) => {
            console.log('[BobbyWS] File loaded');
            console.log(e.target.result);
        };
        reader.readAsText(file);
    }

    handleRawButton(button_id) {
        if (!this.connected) {
            console.log('[BobbyWS] Not connected');
            return;
        }

        if (this.block_send)
            return;

        const msg = { type: "rawBtnPrssd", btn: button_id };
        this.send(JSON.stringify(msg));
    }

    handleButton(button_id) {
        if (!this.connected) {
            console.log('[BobbyWS] Not connected');
            return;
        }

        if (this.block_send)
            return;

        const msg = { type: "btnPressed", btn: button_id };
        this.send(JSON.stringify(msg));
    }

    setNVSKey(key, value) {
        this.send(JSON.stringify({ type: 'setConfig', nvskey: key, value }));
    }
}

window.addEventListener('load', () => {
    let savePasswordElements = document.getElementsByClassName('save-password');
    for (let i = 0; i < savePasswordElements.length; i++) {
        let element = savePasswordElements[i];
        element.addEventListener('click', (event) => {
            const passwordField = document.getElementById(element.getAttribute('for'));
            const password = passwordField.value;
            ws.savePassword(password);
            ws.connect();
            loginModal.hide();
        });
    }
});

window.addEventListener('load', () => {
    connected_indicator = document.createElement('div');
    connected_indicator.id = 'connected-indicator';
    connected_indicator.style.display = 'block';
    connected_indicator.innerHTML = spinnerHTML('idle');
    document.getElementById('navbar-custom-items').appendChild(connected_indicator);

    const login_modal = document.getElementById('bobbyLoginModal');
    loginModal = new bootstrap.Modal(login_modal, {
        backdrop: 'static',
        keyboard: false,
        focus: true
    });

    if (!current_bobbycar) {
        Alert.error('Internal Error', 'Could not find bobbycar');
        return;
    }

    ws = new BobbyWS(current_bobbycar.ota_name);
    if (!ws.loadPassword()) {
        loginModal.show();
    } else {
        ws.connect();
    }

    init_display_control_btn();
});

window.addEventListener('beforeunload', () => {
    ws.disconnect();
});

console.log("BobbyWS loaded");

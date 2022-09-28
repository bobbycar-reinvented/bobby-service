// browser
import { Octokit } from "https://cdn.skypack.dev/pin/@octokit/core@v4.0.5-DCTGyLHthf6deTvrXINL/mode=imports,min/optimized/@octokit/core.js";

window.octokit = null;

function capString(str, length) {
    if (str.length > length) {
        return str.substring(0, length) + '...';
    }
    return str;
}

function escapeHtml(unsafe)
{
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

async function initGithub() {
    try {
        const { access_token } = await fetch("https://service.bobbycar.cloud/api/secure/github_token", {
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
            },
        }).then(r => r.json());
        window.octokit = new Octokit({ auth: access_token });
    } catch (e) {
        Alert.error("Error while fetching github token", `Error ${e.message}`);
        return;
    }
}

async function generateGithubFeed(element, page = 1) {
    const organization = element.dataset.organization;
    const feed = await octokit.request('GET /orgs/{org}/events', {
        org: organization,
        per_page: 100,
        page,
    });

    let template = '';
    let unknown_types = [];

    for (const event of feed.data) {
        const agoString = moment(event.created_at).fromNow();

        const event_name_map = {
            // PushEvent: `pushed to <a href="https://github.com/${event.repo.name}" target="_blank" rel="noopener noreferrer" class="github-repo github-link">${event.repo.name}</a>`,
            // PullRequestEvent: `opened a pull request in <a href="https://github.com/${event.repo.name}" target="_blank" rel="noopener noreferrer" class="github-repo github-link">${event.repo.name}</a>`,
            CreateEvent: `created a ${event.payload.ref_type} ${event.payload.ref_type === 'repository' ? '' : 'in'} <a href="https://github.com/${event.repo.name}" target="_blank" rel="noopener noreferrer" class="github-repo github-link">${event.repo.name}</a>`,
        };

        if (!event_name_map[event.type]) {
            if (!unknown_types.includes(event.type)) {
                unknown_types.push(event.type);
            }
            continue;
        }

        console.log(event);

        template += `
            <div class="event container-fluid mb-2">
                <div class="row">
                    <div class="event__info w-100">
                        <a href="https://github.com/${event.actor.display_login}" target="_blank" rel="noopener noreferrer">
                            <img class="img-profile rounded-circle" width="32" height="32" src="${event.actor.avatar_url}" alt="${event.actor.display_login}">
                        </a>
                        <div class="event__name_with_action">
                            <a href="https://github.com/${event.actor.display_login}" target="_blank" rel="noopener noreferrer" class="github-name github-link ml-2">${event.actor.login}</a>
                            ${event_name_map[event.type]}
                            <span class="event__ago text-muted">${agoString}</span>
                        </div>
                    </div>
                    <div class="event__action_info p-3 mt-1 w-100">
        `;

        switch (event.type) {
            default:
                console.warn('unknown event type', event.type);
                break;
            case 'PushEvent':
                template += `
                    <div class="event__push">
                        <div class="event__push__info">
                            <span class="event__push__commits__count">${event.payload.commits.length}</span>
                            <span class="event__push__commits__text">commit${event.payload.commits.length !== 1 ? 's':''} to</span>
                            <a href="https://github.com/${event.repo.name}/tree/${event.payload.ref.replace('refs/heads/', '')}"><span class="github_branch">${event.payload.ref.replace('refs/heads/', '')}</span></a>
                        </div>
                        <div class="event__push__commits">
                `;

                for (const commit of event.payload.commits) {
                    template += `
                        <div class="event__push__commit">
                            <a href="https://github.com/${event.actor.display_login}" target="_blank" rel="noopener noreferrer">
                                <img class="img-profile rounded-circle" width="16" height="16" src="${event.actor.avatar_url}" alt="${event.actor.display_login}">
                            </a>
                            <a href="https://github.com/${event.repo.name}/commit/${commit.sha}" target="_blank" rel="noopener noreferrer"><span class="github_sha">${commit.sha.substring(0, 7)}</span></a>
                            <span class="github_message">${escapeHtml(capString(commit.message, 148))}</span>
                        </div>
                    `;
                }

                template += `
                        </div>
                    </div>
                `;
                break;
            case 'PullRequestEvent':
                template += `
                    <div class="event__pull_request">
                        <div class="event__pull_request__info">
                            <a href="${event.payload.pull_request.html_url}" target="_blank" rel="noopener noreferrer" class="github-link-2">
                                <span class="event__pull_request__title h6 font-weight-bold">${escapeHtml(capString(event.payload.pull_request.title, 148))}</span>
                            </a>
                            <span class="event__pull_request__number h6 text-muted">#${event.payload.pull_request.number}</span>
                        </div>
                        <div class="event__pull_request__body">
                            <span class="event__pull_request__body__text">${event.payload.pull_request.body ? escapeHtml(capString(event.payload.pull_request.body, 148)) : ''}</span>
                        </div>
                        <div class="event__pull_request__info">
                            <span class="event__pull_request__info__additions text-success">+${event.payload.pull_request.additions}</span>
                            <span class="event__pull_request__info__deletions text-danger">-${event.payload.pull_request.deletions}</span>
                            <span class="event__pull_request__info__changed_files text-muted">${event.payload.pull_request.changed_files} changed file${event.payload.pull_request.changed_files !== 1 ? 's':''}</span>
                        </div>
                    </div>
                `;
                break;
            case 'CreateEvent':
                switch (event.payload.ref_type) {
                    default:
                        console.warn('unknown create event ref_type', event.payload.ref_type);
                        break;
                    case 'branch':
                        template += `
                            <div class="event__create__branch">
                                <div class="event__create__branch__info">
                                    <a href="https://
                            `;
                        break;
                }
                break;
        }

        template += `
                    </div>
                </div>
            </div>
        `;

        if (page === 1) {
            element.innerHTML = template;
        } else {
            element.innerHTML += template;
        }
        element.classList.remove("github-feed");

    }

    if (unknown_types.length > 0) {
        console.log('unknown types', unknown_types);
    }
}

window.addEventListener("load", async () => {
    if (document.querySelector(".needs-github-api")) {
        await initGithub();
    } else return;

    const github_feed = document.querySelector("#github-feed");
    if (github_feed) {
        await generateGithubFeed(github_feed);
    }
});
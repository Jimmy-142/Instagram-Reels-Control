const toggle = document.getElementById("toggle");

// default safe state first (prevents flicker)
toggle.checked = true;

chrome.storage.local.get(["igFixEnabled"], (res) => {
    toggle.checked = res.igFixEnabled ?? true;
});

toggle.addEventListener("change", () => {
    chrome.storage.local.set({
        igFixEnabled: toggle.checked
    });

    chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
            if (!tab.url) continue;

            if (tab.url.includes("instagram.com")) {
                chrome.tabs.reload(tab.id);
            }
        }
    });
});
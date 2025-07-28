

document.getElementById("open-patreon").addEventListener("click", function() {
    chrome.tabs.create({url: "https://www.patreon.com/c/MentalGamesOfficial"});
});

document.getElementById("open-github").addEventListener("click", function() {
    chrome.tabs.create({url: "https://github.com/alex-suspicious/UnsafeYT"});
});

document.getElementById("open-discord").addEventListener("click", function() {
    chrome.tabs.create({url: "https://discord.gg/YbhXPEtNg7"});
});

document.getElementById("open-reddit").addEventListener("click", function() {
    chrome.tabs.create({url: "https://www.reddit.com/r/UnsafeYT"});
});

document.getElementById("open-tool").addEventListener("click", function() {
    chrome.tabs.create({url: "https://github.com/alex-suspicious/UnsafeYTools"});
});
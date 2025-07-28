var isRendering = false;
var toggleButton = document.getElementById("start-stop");
var reloadButton = document.getElementById("reload");

var browserAPI = typeof browser !== 'undefined' ? browser : chrome;

browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    browserAPI.tabs.sendMessage(tabs[0].id, {name: "setTokenGui"}, (response) => {
        if (!response) {
            console.error("Could not get a response from the content script.");
            return;
        }

        var tokenValue = document.getElementById("token-input").value;

        if (!tokenValue || tokenValue.length < 2) {
            document.getElementById("token-input").value = response.token;
        }

        if (response.isRendering) {
            reloadButton.style.display = "inline-block";
            toggleButton.innerHTML = "Stop";
        } else {
            reloadButton.style.display = "none";
            toggleButton.innerHTML = "Start";
        }

        isRendering = response.isRendering;
    });
});

function toggleRendering() {
    isRendering = !isRendering;

    if (isRendering) {
        reloadButton.style.display = "inline-block";
        toggleButton.innerHTML = "Stop";
    } else {
        reloadButton.style.display = "none";
        toggleButton.innerHTML = "Start";
    }

    browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (isRendering) {
            var tokenValue = document.getElementById("token-input").value;

            browserAPI.tabs.sendMessage(tabs[0].id, { name: "turnOn", token: tokenValue }, (response) => {
                if (!response) return;
                toggleButton.innerHTML = response.isRendering ? "Stop" : "Start";
                isRendering = response.isRendering;
            });
        } else {
            browserAPI.tabs.sendMessage(tabs[0].id, { name: "turnOff" }, (response) => {
                if (!response) return;
                toggleButton.innerHTML = response.isRendering ? "Stop" : "Start";
                isRendering = response.isRendering;
            });
        }
    });
}

function reloadRendering() {
    browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (isRendering) {
            var tokenValue = document.getElementById("token-input").value;

            browserAPI.tabs.sendMessage(tabs[0].id, { name: "reloadToken", token: tokenValue }, (response) => {
            });
        }
    });
}

toggleButton.addEventListener("click", toggleRendering);
reloadButton.addEventListener("click", reloadRendering);
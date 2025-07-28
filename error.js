var mainContent = document.getElementById("main-content");

var browserAPI = typeof browser !== 'undefined' ? browser : chrome;

browserAPI.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    mainContent.style.display = "none";
    document.getElementById("error-message").style.display = "block";
    document.getElementById("error-message").innerText = "This extension only works on YouTube.";

    browserAPI.tabs.sendMessage(tabs[0].id, {name: "isYoutube"}, (response) => {
        if (response && response.bool) {
            mainContent.style.display = "block";
            document.getElementById("error-message").style.display = "none";
        }
    });
});
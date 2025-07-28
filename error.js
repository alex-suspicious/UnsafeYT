var mainContent = document.getElementById("main-content");


chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    mainContent.style.display = "none";
    document.getElementById("error-message").style.display = "block";
    document.getElementById("error-message").innerText = "This extension only works on YouTube.";

    chrome.tabs.sendMessage(tabs[0].id, {name: "isYoutube"}, (response) => {
        if( response.bool ){
            mainContent.style.display = "block";
            document.getElementById("error-message").style.display = "none";
        }
    });
});
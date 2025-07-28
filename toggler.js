var isRendering = false;
var toggleButton = document.getElementById("start-stop");
var reloadButton = document.getElementById("reload");

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {name: "setTokenGui"}, (response) => {
        var tokenValue = document.getElementById("token-input").value;

        if( !tokenValue || tokenValue.length < 2 )
            document.getElementById("token-input").value = response.token;

        if( response.isRendering ){
            reloadButton.style.display = "inline-block";
            toggleButton.innerHTML = "Stop";
        }
        else{
            reloadButton.style.display = "none";
            toggleButton.innerHTML = "Start";
        }

        isRendering = response.isRendering;
    });
});

function toggleRendering() {
    isRendering = !isRendering;

    if( isRendering ){
        reloadButton.style.display = "inline-block";
        toggleButton.innerHTML = "Stop";
    }
    else{
        reloadButton.style.display = "none";
        toggleButton.innerHTML = "Start";
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if( isRendering ){
            var tokenValue = document.getElementById("token-input").value;

            chrome.tabs.sendMessage(tabs[0].id, {name: "turnOn", token: tokenValue}, (response) => {
                if( response.isRendering )
                    toggleButton.innerHTML = "Stop";
                else
                    toggleButton.innerHTML = "Start";
        
                isRendering = response.isRendering;
            });    
        }else{
            chrome.tabs.sendMessage(tabs[0].id, {name: "turnOff"}, (response) => {        
                if( response.isRendering )
                    toggleButton.innerHTML = "Stop";
                else
                    toggleButton.innerHTML = "Start";
        
                isRendering = response.isRendering;
            });    
        }
    });
}


function toggleRendering() {
    isRendering = !isRendering;

    if( isRendering ){
        reloadButton.style.display = "inline-block";
        toggleButton.innerHTML = "Stop";
    }
    else{
        reloadButton.style.display = "none";
        toggleButton.innerHTML = "Start";
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if( isRendering ){
            var tokenValue = document.getElementById("token-input").value;

            chrome.tabs.sendMessage(tabs[0].id, {name: "turnOn", token: tokenValue}, (response) => {
                if( response.isRendering )
                    toggleButton.innerHTML = "Stop";
                else
                    toggleButton.innerHTML = "Start";
        
                isRendering = response.isRendering;
            });    
        }else{
            chrome.tabs.sendMessage(tabs[0].id, {name: "turnOff"}, (response) => {        
                if( response.isRendering )
                    toggleButton.innerHTML = "Stop";
                else
                    toggleButton.innerHTML = "Start";
        
                isRendering = response.isRendering;
            });    
        }
    });
}

function reloadRendering() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if( isRendering ){
            var tokenValue = document.getElementById("token-input").value;

            chrome.tabs.sendMessage(tabs[0].id, {name: "reloadToken", token: tokenValue}, (response) => {

            });    
        }
    });
}

toggleButton.addEventListener("click", toggleRendering);
reloadButton.addEventListener("click", reloadRendering);
